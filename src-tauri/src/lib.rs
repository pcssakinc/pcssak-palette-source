// Native layer: fast, deterministic dominant-color extraction from an image.
// Heavy pixel work stays in Rust; all "taste" (ramps, WCAG) lives in TS/culori.
// See docs/COLOR-ENGINE.md §1–2 and §7.

use image::imageops::FilterType;
use image::ImageDecoder;
use kmeans_colors::get_kmeans;
use palette::{IntoColor, Lab, Srgb};
use serde::Serialize;
use std::collections::BTreeMap;
use std::io::Read;
use tauri::path::BaseDirectory;
use tauri::{Manager, State};

mod entitlement;

use entitlement::{
    EntitlementState, EntitlementStatus, LicenseTier, FREE_LIBRARY_LIMIT, PRO_LIBRARY_LIMIT,
};

/// One dominant color returned to the frontend. OKLCH/ramp math happens in TS.
#[derive(Serialize, Clone, Debug)]
pub struct Swatch {
    pub hex: String,
    pub weight: f32,
}

/// Stable native error contract. Rust reports facts; the frontend owns localized wording.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub params: BTreeMap<String, String>,
}

impl AppError {
    fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
            params: BTreeMap::new(),
        }
    }

    fn param(mut self, key: &str, value: impl ToString) -> Self {
        self.params.insert(key.to_string(), value.to_string());
        self
    }

    fn detail(self, error: impl ToString) -> Self {
        self.param("detail", error)
    }
}

type AppResult<T> = Result<T, AppError>;

// Deterministic k-means parameters (COLOR-ENGINE.md §2.2). Fixed seed = reproducible output.
const DOWNSAMPLE_MAX: u32 = 128;
const ALPHA_MIN: u8 = 8;
const K_INITIAL: usize = 8;
const MAX_ITERS: usize = 20;
const CONVERGE_EPS: f32 = 1e-3;
const SEED: u64 = 0x9E37_79B9;
const MAX_FILE_BYTES: u64 = 40 * 1024 * 1024; // reject uploads larger than 40 MB
const MAX_PIXELS: u64 = 40_000_000; // reject images above ~40 megapixels before decoding
                                    // image의 할당 제한은 디코더별 최선 노력 방식이며, 프로세스 전체 메모리의 절대 상한은 아닙니다.
const MAX_DECODE_BYTES: u64 = 256 * 1024 * 1024;
const MEBIBYTE: u64 = 1024 * 1024;
const MAX_FREE_CSS_BYTES: usize = 1024 * 1024;
const MAX_LIBRARY_BACKUP_BYTES: u64 = 4 * 1024 * 1024;
const MAX_EXPORT_PACK_FOLDER_ATTEMPTS: u16 = 1_000;
const INSTALLER_LOCALE_SEED_FILENAME: &str = "installer-locale";
const MAX_INSTALLER_LOCALE_SEED_BYTES: u64 = 32;
const INSTALLER_LOCALES: [&str; 12] = [
    "en", "ko", "ja", "zh-Hans", "zh-Hant", "fr", "de", "ru", "es", "es-419", "pt-BR", "tr",
];

fn mebibytes_ceil(bytes: u64) -> u64 {
    bytes.saturating_add(MEBIBYTE - 1) / MEBIBYTE
}

fn image_too_large_bytes(bytes: u64) -> AppError {
    AppError::new("imageTooLargeBytes")
        .param("actualMb", mebibytes_ceil(bytes))
        .param("maxMb", MAX_FILE_BYTES / MEBIBYTE)
}

fn validate_dimensions(w: u32, h: u32) -> AppResult<()> {
    if (w as u64) * (h as u64) > MAX_PIXELS {
        return Err(AppError::new("imageTooLargeDimensions")
            .param("width", w)
            .param("height", h)
            .param("maxMegapixels", MAX_PIXELS / 1_000_000));
    }
    Ok(())
}

fn image_dimensions(bytes: &[u8]) -> AppResult<(u32, u32)> {
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| AppError::new("imageUnreadable"))?;
    reader.limits(image_limits());
    reader
        .into_dimensions()
        .map_err(|_| AppError::new("imageUnreadable"))
}

fn image_limits() -> image::Limits {
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    limits
}

fn decode_image(bytes: &[u8]) -> AppResult<image::DynamicImage> {
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| AppError::new("imageUnreadable"))?;
    reader.limits(image_limits());
    reader
        .decode()
        .map_err(|_| AppError::new("imageDecodeFailed"))
}

fn extract_from_bytes(bytes: &[u8]) -> AppResult<Vec<Swatch>> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(image_too_large_bytes(bytes.len() as u64));
    }
    // Read only metadata first. This rejects decompression-bomb dimensions before
    // allocating a full raster, then applies a second allocation ceiling to decode.
    let (w, h) = image_dimensions(bytes)?;
    validate_dimensions(w, h)?;
    let img = decode_image(bytes)?;

    // Premultiply alpha BEFORE downsampling. Resizing straight (non-premultiplied) RGBA lets
    // fully-transparent pixels (usually RGB 0,0,0) bleed black into antialiased edges; in
    // premultiplied space transparent pixels contribute nothing, so edge colors stay correct.
    let mut rgba = img.to_rgba8();
    for px in rgba.pixels_mut() {
        let a = px.0[3] as u32;
        px.0[0] = ((px.0[0] as u32 * a) / 255) as u8;
        px.0[1] = ((px.0[1] as u32 * a) / 255) as u8;
        px.0[2] = ((px.0[2] as u32 * a) / 255) as u8;
    }

    // Downsample the premultiplied image to <=128px longest edge (triangle filter).
    let longest = w.max(h);
    let rgba = if longest > DOWNSAMPLE_MAX {
        let scale = DOWNSAMPLE_MAX as f32 / longest as f32;
        let nw = ((w as f32 * scale).round() as u32).max(1);
        let nh = ((h as f32 * scale).round() as u32).max(1);
        image::DynamicImage::ImageRgba8(rgba)
            .resize(nw, nh, FilterType::Triangle)
            .to_rgba8()
    } else {
        rgba
    };

    // Un-premultiply and composite over white in one step: for premultiplied channel `p` with
    // alpha `a`, the color over a white background is exactly `p + (255 - a)`. Skip fully
    // transparent pixels, then convert each visible pixel sRGB -> CIELab (perceptual).
    let mut samples: Vec<Lab> = Vec::with_capacity((rgba.width() * rgba.height()) as usize);
    for px in rgba.pixels() {
        let [pr, pg, pb, a] = px.0;
        if a < ALPHA_MIN {
            continue;
        }
        let inv = 255u32 - a as u32;
        let rf = (pr as u32 + inv).min(255) as f32;
        let gf = (pg as u32 + inv).min(255) as f32;
        let bf = (pb as u32 + inv).min(255) as f32;
        let srgb = Srgb::new(rf / 255.0, gf / 255.0, bf / 255.0);
        samples.push(srgb.into_color());
    }

    if samples.is_empty() {
        return Ok(Vec::new());
    }

    let k = K_INITIAL.min(samples.len()).max(1);
    let result = get_kmeans(k, MAX_ITERS, CONVERGE_EPS, false, &samples, SEED);

    // Weight each centroid by its cluster population.
    let mut counts = vec![0u32; result.centroids.len()];
    for &idx in result.indices.iter() {
        counts[idx as usize] += 1;
    }
    let total: u32 = counts.iter().sum::<u32>().max(1);

    let mut swatches: Vec<Swatch> = result
        .centroids
        .iter()
        .enumerate()
        .map(|(i, lab)| {
            let srgb: Srgb = (*lab).into_color();
            let (r, g, b) = srgb.into_format::<u8>().into_components();
            Swatch {
                hex: format!("#{r:02x}{g:02x}{b:02x}"),
                weight: counts[i] as f32 / total as f32,
            }
        })
        .collect();

    swatches.sort_by(|a, b| {
        b.weight
            .partial_cmp(&a.weight)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(swatches)
}

// 파일이 검사 후 커지더라도 한도보다 한 바이트만 더 읽어 초과 여부를 확인합니다.
fn read_bounded_image(reader: impl Read, error_code: &str) -> AppResult<Vec<u8>> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::new(error_code).detail(error))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(image_too_large_bytes(bytes.len() as u64));
    }
    Ok(bytes)
}

// 색 추출과 프로필 검사가 같은 읽기 한도를 사용합니다. 열린 파일 핸들의 메타데이터를 검사합니다.
fn read_image_file(path: &str, error_code: &str) -> AppResult<Vec<u8>> {
    let file =
        std::fs::File::open(path).map_err(|error| AppError::new(error_code).detail(error))?;
    let metadata = file
        .metadata()
        .map_err(|error| AppError::new(error_code).detail(error))?;
    if !metadata.is_file() {
        return Err(AppError::new(error_code));
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err(image_too_large_bytes(metadata.len()));
    }
    read_bounded_image(file, error_code)
}

/// 디스크 이미지의 주요 색을 추출하며 입력 크기와 디코더 할당 한도를 적용합니다.
#[tauri::command]
fn extract_colors(path: String) -> AppResult<Vec<Swatch>> {
    let bytes = read_image_file(&path, "imageFileReadFailed")?;
    extract_from_bytes(&bytes)
}

/// Extract dominant colors from raw image bytes handed over from the frontend.
#[tauri::command]
fn extract_colors_bytes(bytes: Vec<u8>) -> AppResult<Vec<Swatch>> {
    extract_from_bytes(&bytes)
}

/// Write UTF-8 text to a path the user picked via the native save dialog. Scoped and simple —
/// avoids granting the broad fs plugin capability to the whole webview (least privilege).
#[tauri::command]
fn write_text_file(
    entitlement: State<'_, EntitlementState>,
    path: String,
    contents: String,
) -> AppResult<()> {
    entitlement.require_pro()?;
    write_text_file_impl(path, contents)
}

fn write_text_file_impl(path: String, contents: String) -> AppResult<()> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| AppError::new("fileWriteFailed").detail(error))?;
    }
    std::fs::write(&path, contents).map_err(|error| AppError::new("fileWriteFailed").detail(error))
}

fn has_extension(path: &str, expected: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(expected))
}

fn validate_free_css(path: &str, contents: &str) -> AppResult<()> {
    let valid = has_extension(path, "css")
        && contents.len() <= MAX_FREE_CSS_BYTES
        && !contents.contains('\0')
        && contents.contains("PCssak Palette")
        && contents.contains(":root");
    if valid {
        Ok(())
    } else {
        Err(AppError::new("fileWriteFailed"))
    }
}

/// Free에는 앱이 생성한 기본 CSS만 저장하도록 범위를 좁혀 임의 파일 쓰기 통로가 되지 않게 합니다.
#[tauri::command]
fn write_free_css_file(path: String, contents: String) -> AppResult<()> {
    validate_free_css(&path, &contents)?;
    write_text_file_impl(path, contents)
}

/// Write raw bytes (e.g. a generated .ase swatch file) to a user-chosen path.
/// Same least-privilege pattern as write_text_file — no broad fs capability.
#[tauri::command]
fn write_binary_file(
    entitlement: State<'_, EntitlementState>,
    path: String,
    bytes: Vec<u8>,
) -> AppResult<()> {
    entitlement.require_pro()?;
    write_binary_file_impl(path, bytes)
}

fn write_binary_file_impl(path: String, bytes: Vec<u8>) -> AppResult<()> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| AppError::new("fileWriteFailed").detail(error))?;
    }
    std::fs::write(&path, bytes).map_err(|error| AppError::new("fileWriteFailed").detail(error))
}

fn validate_export_pack_folder_name(folder_name: &str) -> AppResult<()> {
    let valid = !folder_name.is_empty()
        && folder_name.len() <= 64
        && !folder_name.starts_with('-')
        && !folder_name.ends_with('-')
        && folder_name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
    if valid {
        Ok(())
    } else {
        Err(AppError::new("fileWriteFailed"))
    }
}

fn reserve_export_pack_directory_impl(
    parent: &std::path::Path,
    folder_name: &str,
) -> AppResult<std::path::PathBuf> {
    validate_export_pack_folder_name(folder_name)?;
    if !parent.is_dir() {
        return Err(AppError::new("fileWriteFailed"));
    }

    // create_dir는 존재 확인과 생성을 한 번에 처리하므로 다른 프로세스와 경합해도
    // 기존 폴더를 예약한 것으로 잘못 판단하거나 사용자 파일을 덮어쓰지 않습니다.
    for attempt in 1..=MAX_EXPORT_PACK_FOLDER_ATTEMPTS {
        let candidate_name = if attempt == 1 {
            folder_name.to_string()
        } else {
            format!("{folder_name}-{attempt}")
        };
        let candidate = parent.join(candidate_name);
        match std::fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(AppError::new("fileWriteFailed").detail(error));
            }
        }
    }

    Err(AppError::new("fileWriteFailed"))
}

/// Export Pack 전용 새 폴더를 원자적으로 예약합니다.
/// 같은 이름이 있으면 번호를 붙인 새 폴더를 사용하며 기존 폴더에는 쓰지 않습니다.
#[tauri::command]
fn reserve_export_pack_directory(
    entitlement: State<'_, EntitlementState>,
    parent: String,
    folder_name: String,
) -> AppResult<String> {
    entitlement.require_pro()?;
    reserve_export_pack_directory_impl(std::path::Path::new(&parent), &folder_name)
        .map(|path| path.to_string_lossy().into_owned())
}

fn read_text_file_impl(path: String) -> AppResult<String> {
    std::fs::read_to_string(&path).map_err(|error| AppError::new("fileReadFailed").detail(error))
}

fn validate_library_backup_path(path: &str) -> AppResult<()> {
    if has_extension(path, "json") {
        Ok(())
    } else {
        Err(AppError::new("libraryInvalid"))
    }
}

/// 사용자가 선택한 JSON 백업만 현재 권한 수량 한도 안에서 기록합니다.
#[tauri::command]
fn write_library_backup(
    entitlement: State<'_, EntitlementState>,
    path: String,
    contents: String,
) -> AppResult<()> {
    validate_library_backup_path(&path)?;
    if contents.len() as u64 > MAX_LIBRARY_BACKUP_BYTES {
        return Err(AppError::new("libraryInvalid"));
    }
    validate_library_size(&contents, entitlement.tier())?;
    write_text_file_impl(path, contents)
}

/// 가져오기는 최대 60개·4MiB JSON으로 제한하고 실제 저장 단계에서 현재 Free/Pro 한도를 다시 검사합니다.
#[tauri::command]
fn read_library_backup(path: String) -> AppResult<String> {
    validate_library_backup_path(&path)?;
    if std::fs::metadata(&path)
        .map(|metadata| metadata.len() > MAX_LIBRARY_BACKUP_BYTES)
        .unwrap_or(false)
    {
        return Err(AppError::new("libraryInvalid"));
    }
    let contents = read_text_file_impl(path)?;
    if contents.len() as u64 > MAX_LIBRARY_BACKUP_BYTES {
        return Err(AppError::new("libraryInvalid"));
    }
    validate_library_size(&contents, LicenseTier::LifetimePro)?;
    Ok(contents)
}

fn eula_document_filename(locale: &str) -> AppResult<&'static str> {
    match locale {
        "en" => Ok("EULA/en.txt"),
        "ko" => Ok("EULA/ko.txt"),
        "ja" => Ok("EULA/ja.txt"),
        "zh-Hans" => Ok("EULA/zh-Hans.txt"),
        "zh-Hant" => Ok("EULA/zh-Hant.txt"),
        "fr" => Ok("EULA/fr.txt"),
        "de" => Ok("EULA/de.txt"),
        "ru" => Ok("EULA/ru.txt"),
        "es" => Ok("EULA/es.txt"),
        "es-419" => Ok("EULA/es-419.txt"),
        "pt-BR" => Ok("EULA/pt-BR.txt"),
        // v0.1.3까지 저장된 레거시 코드도 같은 계약 파일로 연결합니다.
        "pt-419" => Ok("EULA/pt-BR.txt"),
        "tr" => Ok("EULA/tr.txt"),
        _ => Err(AppError::new("legalDocumentInvalid")),
    }
}

fn legal_document_filename(document: &str, locale: Option<&str>) -> AppResult<&'static str> {
    match document {
        "privacy" => Ok("PRIVACY.md"),
        "eula" => eula_document_filename(locale.unwrap_or("en")),
        "licenses" => Ok("THIRD-PARTY-NOTICES.txt"),
        _ => Err(AppError::new("legalDocumentInvalid")),
    }
}

/// 설치 패키지에 동봉된 법적 문서만 고정된 식별자로 읽습니다.
/// 임의 파일 경로를 받지 않아 웹뷰에 추가 파일 권한을 열지 않습니다.
#[tauri::command]
fn read_bundled_legal_document(
    app: tauri::AppHandle,
    document: String,
    locale: Option<String>,
) -> AppResult<String> {
    let filename = legal_document_filename(&document, locale.as_deref())?;
    let path = app
        .path()
        .resolve(filename, BaseDirectory::Resource)
        .map_err(|error| AppError::new("legalNoticeUnavailable").detail(error))?;
    std::fs::read_to_string(path)
        .map_err(|error| AppError::new("legalNoticeUnavailable").detail(error))
}

fn parse_installer_locale_seed(contents: &str) -> Option<String> {
    let locale = contents.trim();
    if locale == "pt-419" {
        return Some("pt-BR".to_string());
    }
    INSTALLER_LOCALES
        .contains(&locale)
        .then(|| locale.to_string())
}

fn read_installer_locale_seed_file(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut reader = file.take(MAX_INSTALLER_LOCALE_SEED_BYTES + 1);
    let mut bytes = Vec::with_capacity(MAX_INSTALLER_LOCALE_SEED_BYTES as usize + 1);
    reader.read_to_end(&mut bytes).ok()?;
    if bytes.len() > MAX_INSTALLER_LOCALE_SEED_BYTES as usize {
        return None;
    }
    parse_installer_locale_seed(&String::from_utf8(bytes).ok()?)
}

/**
 * 설치기가 앱 데이터의 고정 파일에 남긴 언어 코드만 읽습니다.
 * 경로를 입력받지 않고 크기와 허용 목록을 제한해 임의 파일 읽기 통로가 되지 않게 합니다.
 */
#[tauri::command]
fn read_installer_locale_seed(app: tauri::AppHandle) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?;
    let path = dir.join(INSTALLER_LOCALE_SEED_FILENAME);
    // 단일 파일 핸들에서 최대 33바이트만 읽어 검사 전후 파일 교체와 대용량 할당을 피합니다.
    read_installer_locale_seed_file(&path)
}

fn library_path(app: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::new("libraryUnavailable").detail(error))?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| AppError::new("libraryUnavailable").detail(error))?;
    Ok(dir.join("library.json"))
}

/// The saved-palette library lives as JSON in the OS app-data folder — a real, backup-able
/// file, not browser storage a cache clear could wipe. Missing file reads as an empty list.
#[tauri::command]
fn read_library(app: tauri::AppHandle) -> AppResult<String> {
    let path = library_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok("[]".to_string()),
        Err(error) => Err(AppError::new("libraryReadFailed").detail(error)),
    }
}

#[tauri::command]
fn validate_library_size(contents: &str, tier: LicenseTier) -> AppResult<()> {
    let entries = serde_json::from_str::<serde_json::Value>(contents)
        .map_err(|_| AppError::new("libraryInvalid"))?;
    let count = entries
        .as_array()
        .ok_or_else(|| AppError::new("libraryInvalid"))?
        .len();
    let limit = if tier.is_pro() {
        PRO_LIBRARY_LIMIT
    } else {
        FREE_LIBRARY_LIMIT
    };
    if count > limit {
        return Err(AppError::new("libraryLimitExceeded").param("limit", limit));
    }
    Ok(())
}

#[tauri::command]
fn get_entitlement_status(entitlement: State<'_, EntitlementState>) -> EntitlementStatus {
    entitlement.status()
}

#[tauri::command]
fn write_library(
    app: tauri::AppHandle,
    entitlement: State<'_, EntitlementState>,
    contents: String,
) -> AppResult<()> {
    validate_library_size(&contents, entitlement.tier())?;
    let path = library_path(&app)?;
    std::fs::write(&path, contents)
        .map_err(|error| AppError::new("libraryWriteFailed").detail(error))
}

fn contains_ascii_ci(hay: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || hay.len() < needle.len() {
        return false;
    }
    hay.windows(needle.len())
        .any(|w| w.eq_ignore_ascii_case(needle))
}

/// Classify an embedded ICC profile. None = sRGB or untagged (the common, correct case);
/// Some(name) = a non-sRGB profile, so the UI can warn that colors are read as sRGB.
fn classify_profile(icc: Option<&[u8]>) -> Option<String> {
    let bytes = icc?;
    if contains_ascii_ci(bytes, b"srgb") {
        return None;
    }
    let known: [(&[u8], &str); 4] = [
        (b"Display P3", "Display P3"),
        (b"Adobe RGB", "Adobe RGB"),
        (b"ProPhoto", "ProPhoto RGB"),
        (b"P3", "Display P3"),
    ];
    for (needle, name) in known {
        if contains_ascii_ci(bytes, needle) {
            return Some(name.to_string());
        }
    }
    Some("non-sRGB".to_string())
}

// WebP의 ICC는 청크 선언 길이로 메모리를 할당하지 않고 검증한 입력 범위를 빌립니다.
// RIFF 밖의 추가 바이트는 ICC로 해석하지 않으며, ICC 뒤의 청크도 끝까지 검사합니다.
fn read_webp_icc(bytes: &[u8]) -> AppResult<Option<&[u8]>> {
    let invalid = || AppError::new("imageProfileUnreadable");
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err(invalid());
    }
    let riff_size = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    let riff_end = 8usize
        .checked_add(riff_size)
        .filter(|end| *end >= 12 && *end <= bytes.len())
        .ok_or_else(invalid)?;
    let mut position = 12usize;
    let mut icc = None;
    while position < riff_end {
        let header_end = position
            .checked_add(8)
            .filter(|end| *end <= riff_end)
            .ok_or_else(invalid)?;
        let header = &bytes[position..header_end];
        let chunk_size = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
        let chunk_end = header_end
            .checked_add(chunk_size)
            .filter(|end| *end <= riff_end)
            .ok_or_else(invalid)?;
        let next = chunk_end
            .checked_add(chunk_size & 1)
            .filter(|end| *end <= riff_end)
            .ok_or_else(invalid)?;
        // 홀수 길이 청크 뒤에는 RIFF 범위 안의 0 패딩 한 바이트가 있어야 합니다.
        if chunk_size & 1 != 0 && bytes[chunk_end] != 0 {
            return Err(invalid());
        }
        // 기존 디코더와 같이 첫 ICCP만 사용하되 나머지 청크의 경계도 확인합니다.
        if &header[..4] == b"ICCP" && icc.is_none() {
            icc = Some(&bytes[header_end..chunk_end]);
        }
        position = next;
    }
    Ok(icc)
}

// 프로필 분석도 색 추출과 같은 입력·화소·디코더 한도를 사용하고 픽셀 전체를 디코딩하지 않습니다.
fn detect_color_profile_bytes(bytes: &[u8]) -> AppResult<Option<String>> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(image_too_large_bytes(bytes.len() as u64));
    }
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| AppError::new("imageProfileUnreadable").detail(error))?;
    reader.limits(image_limits());
    // WebP 어댑터의 ICC 할당에는 image::Limits가 적용되지 않으므로 먼저 범위를 검사합니다.
    let webp_icc = if reader.format() == Some(image::ImageFormat::WebP) {
        Some(read_webp_icc(bytes)?)
    } else {
        None
    };
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| AppError::new("imageProfileUnreadable"))?;
    let (width, height) = decoder.dimensions();
    validate_dimensions(width, height)?;
    if let Some(icc) = webp_icc {
        return Ok(classify_profile(icc));
    }
    let icc = decoder
        .icc_profile()
        .map_err(|_| AppError::new("imageProfileUnreadable"))?;
    Ok(classify_profile(icc.as_deref()))
}

#[tauri::command]
fn detect_color_profile(path: String) -> AppResult<Option<String>> {
    let bytes = read_image_file(&path, "imageProfileUnreadable")?;
    detect_color_profile_bytes(&bytes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    #[cfg(feature = "beta-updater")]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(EntitlementState::from_build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            extract_colors,
            extract_colors_bytes,
            write_text_file,
            write_free_css_file,
            write_binary_file,
            reserve_export_pack_directory,
            write_library_backup,
            read_library_backup,
            read_bundled_legal_document,
            read_installer_locale_seed,
            get_entitlement_status,
            read_library,
            write_library,
            detect_color_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running PCssak Palette");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> std::path::PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("pcssak-{label}-{}-{nonce}", std::process::id()))
    }

    fn png_bytes(img: image::DynamicImage) -> Vec<u8> {
        let mut bytes: Vec<u8> = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
        bytes
    }

    #[test]
    fn bounded_image_reader_stops_on_an_unbounded_stream() {
        let error = read_bounded_image(std::io::repeat(0), "imageFileReadFailed").unwrap_err();
        assert_eq!(error.code, "imageTooLargeBytes");
    }

    #[test]
    fn image_profile_rejects_oversized_file_before_reading() {
        let root = temp_root("profile-input-limit");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("oversized.png");
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_FILE_BYTES + 1).unwrap();
        drop(file);
        let error = detect_color_profile(path.to_string_lossy().into_owned()).unwrap_err();
        assert_eq!(error.code, "imageTooLargeBytes");
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn image_profile_accepts_untagged_png_and_rejects_invalid_data() {
        let bytes = png_bytes(image::DynamicImage::new_rgb8(2, 2));
        assert_eq!(detect_color_profile_bytes(&bytes).unwrap(), None);
        assert!(detect_color_profile_bytes(b"not an image").is_err());
        assert_eq!(image_limits().max_alloc, Some(MAX_DECODE_BYTES));
    }

    #[test]
    fn webp_icc_reader_borrows_only_the_declared_chunk() {
        let bytes = webp_riff_fixture(b"JUNK\x01\0\0\0a\0ICCP\x0a\0\0\0Display P3");
        let icc = read_webp_icc(&bytes).unwrap().unwrap();
        assert_eq!(icc, b"Display P3");
        assert_eq!(icc.as_ptr(), bytes[30..40].as_ptr());
        assert_eq!(classify_profile(Some(icc)).as_deref(), Some("Display P3"));
    }

    // 작은 합성 RIFF만 만들며 선언 길이에 비례하는 메모리는 할당하지 않습니다.
    fn webp_riff_fixture(chunks: &[u8]) -> Vec<u8> {
        let riff_size = u32::try_from(chunks.len()).unwrap().checked_add(4).unwrap();
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&riff_size.to_le_bytes());
        bytes.extend_from_slice(b"WEBP");
        bytes.extend_from_slice(chunks);
        bytes
    }

    #[test]
    fn webp_icc_reader_rejects_invalid_container_and_chunk_ranges() {
        let mut too_large_riff = webp_riff_fixture(&[]);
        too_large_riff[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
        let mut too_small_riff = webp_riff_fixture(&[]);
        too_small_riff[4..8].copy_from_slice(&3u32.to_le_bytes());
        let cases = [
            Vec::new(),
            b"RIFF".to_vec(),
            too_large_riff,
            too_small_riff,
            webp_riff_fixture(b"ICCP"),
            webp_riff_fixture(b"ICCP\xff\xff\xff\xff"),
            webp_riff_fixture(b"ICCP\x04\0\0\0P3"),
            webp_riff_fixture(b"ICCP\x02\0\0\0P3BAD"),
        ];
        for bytes in cases {
            assert_eq!(
                read_webp_icc(&bytes).unwrap_err().code,
                "imageProfileUnreadable"
            );
            assert_eq!(
                detect_color_profile_bytes(&bytes).unwrap_err().code,
                "imageProfileUnreadable"
            );
        }
    }

    #[test]
    fn webp_icc_reader_requires_complete_zero_padding() {
        let valid = webp_riff_fixture(b"ICCP\x03\0\0\0P3!\0");
        assert_eq!(read_webp_icc(&valid).unwrap(), Some(&b"P3!"[..]));
        for chunks in [&b"ICCP\x03\0\0\0P3!"[..], &b"ICCP\x03\0\0\0P3!\x01"[..]] {
            assert_eq!(
                read_webp_icc(&webp_riff_fixture(chunks)).unwrap_err().code,
                "imageProfileUnreadable"
            );
        }
    }

    #[test]
    fn webp_icc_reader_ignores_data_after_the_riff_end() {
        let mut bytes = webp_riff_fixture(&[]);
        bytes.extend_from_slice(b"ICCP\x0a\0\0\0Display P3");
        assert_eq!(read_webp_icc(&bytes).unwrap(), None);
    }

    #[test]
    fn webp_profile_preserves_tagged_and_untagged_results() {
        for (icc, expected) in [
            (None, None),
            (Some(&b"sRGB"[..]), None),
            (Some(&b"Display P3"[..]), Some("Display P3")),
        ] {
            let mut bytes = Vec::new();
            let mut encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut bytes);
            if let Some(icc) = icc {
                image::ImageEncoder::set_icc_profile(&mut encoder, icc.to_vec()).unwrap();
            }
            encoder
                .encode(&[0; 12], 2, 2, image::ExtendedColorType::Rgb8)
                .unwrap();
            assert_eq!(read_webp_icc(&bytes).unwrap(), icc);
            assert_eq!(
                detect_color_profile_bytes(&bytes).unwrap().as_deref(),
                expected
            );
        }
    }

    #[test]
    fn non_webp_profile_paths_preserve_png_and_jpeg_results() {
        for format in [image::ImageFormat::Png, image::ImageFormat::Jpeg] {
            let mut bytes = Vec::new();
            image::DynamicImage::new_rgb8(2, 2)
                .write_to(&mut std::io::Cursor::new(&mut bytes), format)
                .unwrap();
            assert_eq!(detect_color_profile_bytes(&bytes).unwrap(), None);
        }
    }

    #[test]
    fn image_file_reader_rejects_a_directory() {
        let root = temp_root("profile-directory");
        std::fs::create_dir_all(&root).unwrap();
        assert!(read_image_file(root.to_str().unwrap(), "imageProfileUnreadable").is_err());
        std::fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn installer_locale_seed_accepts_only_supported_codes() {
        for locale in INSTALLER_LOCALES {
            assert_eq!(
                parse_installer_locale_seed(&format!(" {locale}\r\n")),
                Some(locale.to_string())
            );
        }
        assert_eq!(
            parse_installer_locale_seed("pt-419"),
            Some("pt-BR".to_string())
        );
    }

    #[test]
    fn installer_locale_seed_rejects_paths_and_unknown_values() {
        for invalid in ["", "../../ko", "KO", "pt-PT", "en\0ko", "한국어"] {
            assert_eq!(parse_installer_locale_seed(invalid), None);
        }
    }

    #[test]
    fn installer_locale_seed_file_reads_only_the_bounded_allowlisted_value() {
        let root = temp_root("installer-locale");
        std::fs::create_dir_all(&root).unwrap();
        let seed = root.join("installer-locale");

        std::fs::write(&seed, b"es-419\r\n").unwrap();
        assert_eq!(
            read_installer_locale_seed_file(&seed),
            Some("es-419".to_string())
        );

        std::fs::write(
            &seed,
            vec![b'a'; MAX_INSTALLER_LOCALE_SEED_BYTES as usize + 1],
        )
        .unwrap();
        assert_eq!(read_installer_locale_seed_file(&seed), None);

        std::fs::write(&seed, b"../../ko").unwrap();
        assert_eq!(read_installer_locale_seed_file(&seed), None);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn extracts_blue_from_solid_image() {
        let mut buf = image::RgbaImage::new(48, 48);
        for p in buf.pixels_mut() {
            *p = image::Rgba([0x3b, 0x82, 0xf6, 255]);
        }
        let swatches =
            extract_from_bytes(&png_bytes(image::DynamicImage::ImageRgba8(buf))).unwrap();
        assert!(!swatches.is_empty(), "expected at least one swatch");
        let top = &swatches[0];
        let r = u8::from_str_radix(&top.hex[1..3], 16).unwrap();
        let g = u8::from_str_radix(&top.hex[3..5], 16).unwrap();
        let b = u8::from_str_radix(&top.hex[5..7], 16).unwrap();
        assert!(
            b > 150 && b > r && b > g,
            "expected blue-dominant, got {}",
            top.hex
        );
        let total: f32 = swatches.iter().map(|s| s.weight).sum();
        assert!(
            (total - 1.0).abs() < 0.01,
            "weights should sum to ~1, got {total}"
        );
    }

    #[test]
    fn returns_empty_for_fully_transparent_image() {
        let buf = image::RgbaImage::new(16, 16); // all pixels (0,0,0,0) → skipped
        let swatches =
            extract_from_bytes(&png_bytes(image::DynamicImage::ImageRgba8(buf))).unwrap();
        assert!(
            swatches.is_empty(),
            "fully transparent image should yield no colors"
        );
    }

    #[test]
    fn is_deterministic() {
        let mut buf = image::RgbaImage::new(40, 40);
        for (i, p) in buf.pixels_mut().enumerate() {
            // two-tone checker so k-means has real clusters to find
            *p = if i % 2 == 0 {
                image::Rgba([0xe1, 0x1d, 0x48, 255])
            } else {
                image::Rgba([0x10, 0xb9, 0x81, 255])
            };
        }
        let bytes = png_bytes(image::DynamicImage::ImageRgba8(buf));
        let a = extract_from_bytes(&bytes).unwrap();
        let b = extract_from_bytes(&bytes).unwrap();
        let ha: Vec<_> = a.iter().map(|s| s.hex.clone()).collect();
        let hb: Vec<_> = b.iter().map(|s| s.hex.clone()).collect();
        assert_eq!(ha, hb, "same image must produce identical swatches");
    }

    #[test]
    fn rejects_oversized_input() {
        let big = vec![0u8; (MAX_FILE_BYTES + 1) as usize];
        let err = extract_from_bytes(&big).unwrap_err();
        assert_eq!(err.code, "imageTooLargeBytes");
        assert_eq!(err.params.get("actualMb").map(String::as_str), Some("41"));
        assert_eq!(err.params.get("maxMb").map(String::as_str), Some("40"));
    }

    #[test]
    fn rejects_oversized_dimensions_before_decode() {
        let err = validate_dimensions(10_000, 4_001).unwrap_err();
        assert_eq!(err.code, "imageTooLargeDimensions");
        assert_eq!(err.params.get("width").map(String::as_str), Some("10000"));
        assert_eq!(err.params.get("height").map(String::as_str), Some("4001"));
    }

    #[test]
    fn returns_stable_error_code_for_unreadable_image() {
        let err = extract_from_bytes(b"not an image").unwrap_err();
        assert_eq!(err.code, "imageUnreadable");
        assert!(err.params.is_empty());
    }

    // Export Pack writes into a folder that doesn't exist yet — both write
    // commands must create parent directories instead of failing.
    #[test]
    fn write_commands_create_parent_dirs() {
        let root = temp_root("write");
        let nested = root.join("brand-palette");

        let txt = nested.join("a.css");
        write_text_file_impl(txt.to_string_lossy().into_owned(), ":root{}".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&txt).unwrap(), ":root{}");

        let bin = nested.join("b.ase");
        write_binary_file_impl(
            bin.to_string_lossy().into_owned(),
            vec![0x41, 0x53, 0x45, 0x46],
        )
        .unwrap();
        assert_eq!(std::fs::read(&bin).unwrap(), vec![0x41, 0x53, 0x45, 0x46]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn export_pack_reservation_never_reuses_an_existing_folder() {
        let root = temp_root("export-pack-reservation");
        std::fs::create_dir_all(&root).unwrap();

        let first = reserve_export_pack_directory_impl(&root, "brand-palette").unwrap();
        assert_eq!(first, root.join("brand-palette"));
        let sentinel = first.join("user-edited.css");
        std::fs::write(&sentinel, b"keep me").unwrap();

        let second = reserve_export_pack_directory_impl(&root, "brand-palette").unwrap();
        assert_eq!(second, root.join("brand-palette-2"));
        assert_eq!(std::fs::read(&sentinel).unwrap(), b"keep me");

        let third = reserve_export_pack_directory_impl(&root, "brand-palette").unwrap();
        assert_eq!(third, root.join("brand-palette-3"));
        assert!(first.is_dir());
        assert!(second.is_dir());
        assert!(third.is_dir());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn export_pack_reservation_rejects_unsafe_folder_names() {
        let root = temp_root("export-pack-invalid");
        std::fs::create_dir_all(&root).unwrap();

        for invalid in ["", "../brand", "brand/palette", "Brand", "-brand", "brand-"] {
            assert_eq!(
                reserve_export_pack_directory_impl(&root, invalid)
                    .unwrap_err()
                    .code,
                "fileWriteFailed"
            );
        }
        assert_eq!(
            reserve_export_pack_directory_impl(&root.join("missing"), "brand-palette")
                .unwrap_err()
                .code,
            "fileWriteFailed"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn free_css_writer_accepts_only_generated_css() {
        let valid = "/* PCssak Palette — generated color ramp */\n:root { --brand-500: #3b82f6; }";
        validate_free_css("brand.css", valid).unwrap();
        validate_free_css("brand.CSS", valid).unwrap();
        assert_eq!(
            validate_free_css("brand.txt", valid).unwrap_err().code,
            "fileWriteFailed"
        );
        assert_eq!(
            validate_free_css("brand.css", ":root {}").unwrap_err().code,
            "fileWriteFailed"
        );
    }

    #[test]
    fn library_backup_accepts_only_json_paths() {
        validate_library_backup_path("pcssak-palettes.json").unwrap();
        validate_library_backup_path("pcssak-palettes.JSON").unwrap();
        assert_eq!(
            validate_library_backup_path("pcssak-palettes.txt")
                .unwrap_err()
                .code,
            "libraryInvalid"
        );
    }

    #[test]
    fn file_commands_return_stable_error_codes() {
        let root = temp_root("file-errors");
        std::fs::create_dir_all(&root).unwrap();

        // A regular file cannot also be a parent directory. This reliably exercises
        // create_dir_all failures without depending on platform-specific permissions.
        let blocker = root.join("not-a-directory");
        std::fs::write(&blocker, b"block").unwrap();
        let impossible = blocker.join("out.css").to_string_lossy().into_owned();
        assert_eq!(
            write_text_file_impl(impossible.clone(), ":root{}".into())
                .unwrap_err()
                .code,
            "fileWriteFailed"
        );
        assert_eq!(
            write_binary_file_impl(impossible, vec![0, 1, 2])
                .unwrap_err()
                .code,
            "fileWriteFailed"
        );

        let missing = root.join("missing.file").to_string_lossy().into_owned();
        assert_eq!(
            read_text_file_impl(missing.clone()).unwrap_err().code,
            "fileReadFailed"
        );
        assert_eq!(
            extract_colors(missing.clone()).unwrap_err().code,
            "imageFileReadFailed"
        );
        assert_eq!(
            detect_color_profile(missing).unwrap_err().code,
            "imageProfileUnreadable"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn legal_documents_are_restricted_to_bundled_files() {
        assert_eq!(
            legal_document_filename("privacy", None).unwrap(),
            "PRIVACY.md"
        );
        assert_eq!(
            legal_document_filename("eula", Some("ko")).unwrap(),
            "EULA/ko.txt"
        );
        assert_eq!(
            legal_document_filename("eula", Some("pt-BR")).unwrap(),
            "EULA/pt-BR.txt"
        );
        assert_eq!(
            legal_document_filename("eula", Some("pt-419")).unwrap(),
            "EULA/pt-BR.txt"
        );
        assert_eq!(
            legal_document_filename("licenses", None).unwrap(),
            "THIRD-PARTY-NOTICES.txt"
        );
        assert_eq!(
            legal_document_filename("../../secret.txt", None)
                .unwrap_err()
                .code,
            "legalDocumentInvalid"
        );
        assert_eq!(
            legal_document_filename("eula", Some("../../secret.txt"))
                .unwrap_err()
                .code,
            "legalDocumentInvalid"
        );
        for locale in INSTALLER_LOCALES {
            assert!(legal_document_filename("eula", Some(locale)).is_ok());
        }
    }

    #[test]
    fn native_library_limit_matches_the_license_tier() {
        let free = serde_json::to_string(&vec![serde_json::json!({}); FREE_LIBRARY_LIMIT]).unwrap();
        validate_library_size(&free, LicenseTier::Free).unwrap();

        let too_many =
            serde_json::to_string(&vec![serde_json::json!({}); FREE_LIBRARY_LIMIT + 1]).unwrap();
        let error = validate_library_size(&too_many, LicenseTier::Free).unwrap_err();
        assert_eq!(error.code, "libraryLimitExceeded");
        assert_eq!(error.params.get("limit").map(String::as_str), Some("10"));

        validate_library_size(&too_many, LicenseTier::LifetimePro).unwrap();
        assert_eq!(
            validate_library_size("{}", LicenseTier::Free)
                .unwrap_err()
                .code,
            "libraryInvalid"
        );
    }
}
