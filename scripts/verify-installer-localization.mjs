import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const attributesPath = path.join(repositoryRoot, ".gitattributes");
const installerDirectory = path.join(repositoryRoot, "src-tauri", "installer");
const templatePath = path.join(installerDirectory, "installer.nsi");
const hooksPath = path.join(installerDirectory, "hooks.nsh");
const configPath = path.join(repositoryRoot, "src-tauri", "tauri.conf.json");
const packagePath = path.join(repositoryRoot, "package.json");
const packageLockPath = path.join(repositoryRoot, "package-lock.json");
const rustPath = path.join(repositoryRoot, "src-tauri", "src", "lib.rs");
const typescriptLocalePath = path.join(repositoryRoot, "src", "i18n", "index.ts");

const expectedLanguages = [
  "English",
  "Korean",
  "Japanese",
  "SimpChinese",
  "TradChinese",
  "French",
  "German",
  "Russian",
  "Spanish",
  "SpanishInternational",
  "PortugueseBR",
  "Turkish",
];

const localeMappings = [
  ["LANG_ENGLISH", "en", "en.txt"],
  ["LANG_KOREAN", "ko", "ko.txt"],
  ["LANG_JAPANESE", "ja", "ja.txt"],
  ["LANG_SIMPCHINESE", "zh-Hans", "zh-Hans.txt"],
  ["LANG_TRADCHINESE", "zh-Hant", "zh-Hant.txt"],
  ["LANG_FRENCH", "fr", "fr.txt"],
  ["LANG_GERMAN", "de", "de.txt"],
  ["LANG_RUSSIAN", "ru", "ru.txt"],
  ["LANG_SPANISH", "es", "es.txt"],
  ["LANG_SPANISHINTERNATIONAL", "es-419", "es-419.txt"],
  ["LANG_PORTUGUESEBR", "pt-BR", "pt-BR.txt"],
  ["LANG_TURKISH", "tr", "tr.txt"],
];

const spanishSpainLangIds = [1034, 3082];
const spanishLatinAmericaLangIds = [
  2058, 4106, 5130, 6154, 7178, 8202, 9226, 10250, 11274, 12298, 13322,
  14346, 15370, 16394, 17418, 18442, 19466, 20490, 21514, 22538, 23562,
];

const templateHeader = `; PCssak 고정 템플릿
; 원본: Tauri CLI 2.11.4 공식 installer.nsi
; https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi
; 수정: 신규 설치 언어·EULA를 연결하고 실행 중인 앱 확인 뒤 구형 관리 파일을 정리합니다.

`;

const customLicensePage = `; 2. License Page (신규 설치에서만 선택 언어의 전문을 표시)
!if "\${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipLicenseUnlessFreshInstall
  !insertmacro MUI_PAGE_LICENSE "$(PcssakEula)"
!endif`;
const upstreamLicensePage = `; 2. License Page (if defined)
!if "\${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MUI_PAGE_LICENSE "\${LICENSE}"
!endif`;

const customLicenseMappings = `; 설치기에서 선택한 언어와 같은 EULA 전문을 표시합니다.
${localeMappings
  .map(
    ([language, , filename]) =>
      `LicenseLangString PcssakEula \${${language}} "\${PCSSAK_EULA_DIR}\\${filename}"`,
  )
  .join("\n")}

`;

const customAllLanguages = `; NSIS의 기본 코드페이지 필터로 일부 지원 언어가 목록에서 숨지 않도록 합니다.
; 이 설치기는 Unicode이므로 12개 지원 언어를 모두 안전하게 표시할 수 있습니다.
!define MUI_LANGDLL_ALLLANGUAGES

`;

const customLanguageRestore = `Function RestoreSupportedInstallerLanguage
  ReadRegStr $R8 HKCU "\${MANUPRODUCTKEY}" "Installer Language"
${localeMappings
  .map(
    ([language], index) =>
      `  \${${index === 0 ? "If" : "OrIf"}} $R8 = \${${language}}`,
  )
  .join("\n")}
    StrCpy $LANGUAGE $R8
  \${EndIf}
FunctionEnd

`;

const customSpanishLanguageAlias = `; NSIS의 SpanishInternational은 LANGID 3082(스페인)입니다.
; PCSSAK은 이 슬롯을 중남미 번역을 고르는 기술 별칭으로만 사용하므로,
; 설치 언어 선택창에서는 실제 제공 카탈로그 이름을 명시적으로 표시합니다.
!define LANGFILE_SpanishInternational_ENGLISHNAME "Spanish (Latin America)"
!define LANGFILE_SpanishInternational_NAME "Español (Latinoamérica)"
!define LANGFILE_SpanishInternational_LANGDLL "Español (Latinoamérica)"

`;

const customSpanishDefaultFunction = `Function SelectFreshInstallSpanishDefault
  ; NSIS가 제공하는 중남미 전용 언어 슬롯이 없어 3082를 기술 별칭으로 재사용합니다.
  ; 실제 Windows UI LANGID 3082와 1034는 모두 스페인이므로 반드시 es로 보냅니다.
  System::Call 'kernel32::GetUserDefaultUILanguage() i .s'
  Pop $R8
  \${If} $R8 = \${LANG_SPANISH}
  \${OrIf} $R8 = \${LANG_SPANISHINTERNATIONAL}
    StrCpy $LANGUAGE \${LANG_SPANISH}
    Return
  \${EndIf}

  ; 기본 언어가 스페인어인지 먼저 확인한 뒤 검증한 중남미 LANGID만 허용합니다.
  IntOp $R9 $R8 & 0x03FF
  \${If} $R9 <> 0x000A
    Return
  \${EndIf}
${spanishLatinAmericaLangIds
  .map(
    (langId, index) =>
      `  \${${index === 0 ? "If" : "OrIf"}} $R8 = ${langId}`,
  )
  .join("\n")}
    StrCpy $LANGUAGE \${LANG_SPANISHINTERNATIONAL}
  \${EndIf}
FunctionEnd

`;

const customInitialization = `  !insertmacro SetContext

  ; 설치 흔적이나 앱 데이터가 하나라도 남아 있으면 기존 사용자로 처리합니다.
  StrCpy $ExistingInstall 0
  ReadRegStr $R8 SHCTX "\${UNINSTKEY}" "UninstallString"
  \${If} $R8 != ""
    StrCpy $ExistingInstall 1
  \${Else}
    ReadRegStr $R8 SHCTX "\${MANUPRODUCTKEY}" ""
    \${If} $R8 != ""
      StrCpy $ExistingInstall 1
    \${EndIf}
  \${EndIf}
  \${If} $ExistingInstall = 0
  \${AndIf} \${FileExists} "$APPDATA\\\${BUNDLEID}\\*.*"
    StrCpy $ExistingInstall 1
  \${EndIf}
  \${If} $ExistingInstall = 0
  \${AndIf} \${FileExists} "$LOCALAPPDATA\\\${BUNDLEID}\\*.*"
    StrCpy $ExistingInstall 1
  \${EndIf}

  ; 기존 설치는 선택창 없이 이전 설치 언어를 복원하되 허용된 LANGID만 사용합니다.
  \${If} $ExistingInstall = 1
    Call RestoreSupportedInstallerLanguage
  \${EndIf}

  ; 자동 업데이트·수동 덮어 설치·무인 설치에서는 언어 선택을 반복하지 않습니다.
  !if "\${DISPLAYLANGUAGESELECTOR}" == "true"
    \${If} $PassiveMode <> 1
    \${AndIf} $UpdateMode <> 1
    \${AndIf} $ExistingInstall = 0
      Call SelectFreshInstallSpanishDefault
      !insertmacro MUI_LANGDLL_DISPLAY
    \${EndIf}
  !endif
`;
const upstreamInitialization = `  !if "\${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext
`;

const customSkipFunction = `Function SkipLicenseUnlessFreshInstall
  \${If} $PassiveMode = 1
  \${OrIf} $UpdateMode = 1
  \${OrIf} $ExistingInstall = 1
    Abort
  \${EndIf}
FunctionEnd

`;

const managedInstallCleanup = `!macro NSIS_HOOK_PREINSTALL
  ; 업데이트·덮어 설치에서는 PCssak Palette가 관리하는 문서만 먼저 정리합니다.
  ; 사용자 팔레트와 설정이 있는 APPDATA·LOCALAPPDATA 경로 및 임의 파일은 건드리지 않습니다.
  \${If} $UpdateMode = 1
  \${OrIf} $ExistingInstall = 1
    Delete "$INSTDIR\\EULA.md"
    RMDir /r "$INSTDIR\\EULA"
    Delete "$INSTDIR\\PRIVACY.md"
    Delete "$INSTDIR\\THIRD-PARTY-NOTICES.txt"
  \${EndIf}
!macroend`;

const upstreamInstallPrelude = `Section Install
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "\${MAINBINARYNAME}.exe" "\${PRODUCTNAME}"
`;
const customInstallPrelude = `Section Install
  SetOutPath $INSTDIR

  !insertmacro CheckIfAppIsRunning "\${MAINBINARYNAME}.exe" "\${PRODUCTNAME}"

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif
`;

const customTemplateEndMarker = "; PCssak 커스텀 템플릿 끝\n";

// GitHub의 Tauri 2.11.4 원문은 마지막 빈 줄까지 포함하고, 설치된 CLI 바이너리에
// 내장된 같은 템플릿은 그 마지막 LF 하나만 제거되어 있습니다. 내용 차이가 없음을
// 두 해시로 각각 고정해 검증 기준이 조용히 바뀌지 않게 합니다.
const expectedUpstreamSha256 =
  "43380dfd24d553568cafe13ac597f3e756a296706e442fb31ed32c4ecabe43a5";
const expectedEmbeddedUpstreamSha256 =
  "20f4ecc730defb71f1342eaeaec4021df13be3d843abba0effe88ea5835fa079";
const errors = [];
const requiredAttributeRules = [
  "src-tauri/installer/installer.nsi text eol=lf",
  "src-tauri/installer/hooks.nsh text eol=lf",
  "src-tauri/installer/eula/*.txt text eol=crlf",
];

function replaceExactlyOnce(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0 || text.indexOf(search, first + search.length) >= 0) {
    errors.push(`${label}: 기준 블록이 정확히 하나가 아닙니다.`);
    return text;
  }
  return text.replace(search, replacement);
}

function expectContains(text, expected, label) {
  if (!text.includes(expected)) errors.push(`${label}: 필수 구문이 없습니다.`);
}

function installDecision({ passive, update, existing }) {
  return {
    showLanguageSelector: !passive && !update && !existing,
    showLicense: !passive && !update && !existing,
    writeLocaleSeed: !update && !existing,
  };
}

function resolveSpanishInstallerDefault(uiLangId) {
  if (!Number.isInteger(uiLangId) || uiLangId < 0 || uiLangId > 0xffff) return null;
  if (spanishSpainLangIds.includes(uiLangId)) return 1034;
  if ((uiLangId & 0x03ff) !== 0x000a) return null;
  if (spanishLatinAmericaLangIds.includes(uiLangId)) return 3082;
  return null;
}

const branchCases = [
  {
    label: "신규 대화형 설치",
    input: { passive: false, update: false, existing: false },
    expected: {
      showLanguageSelector: true,
      showLicense: true,
      writeLocaleSeed: true,
    },
  },
  {
    label: "신규 무인 설치",
    input: { passive: true, update: false, existing: false },
    expected: {
      showLanguageSelector: false,
      showLicense: false,
      writeLocaleSeed: true,
    },
  },
  {
    label: "자동 업데이트",
    input: { passive: true, update: true, existing: true },
    expected: {
      showLanguageSelector: false,
      showLicense: false,
      writeLocaleSeed: false,
    },
  },
  {
    label: "수동 덮어 설치",
    input: { passive: false, update: false, existing: true },
    expected: {
      showLanguageSelector: false,
      showLicense: false,
      writeLocaleSeed: false,
    },
  },
];

for (const branch of branchCases) {
  const actual = installDecision(branch.input);
  if (JSON.stringify(actual) !== JSON.stringify(branch.expected)) {
    errors.push(`${branch.label}: 신규·업데이트 분기 결과가 다릅니다.`);
  }
}

for (const langId of spanishSpainLangIds) {
  if (resolveSpanishInstallerDefault(langId) !== 1034) {
    errors.push(`스페인 Windows UI LANGID ${langId}가 es 기본값으로 연결되지 않습니다.`);
  }
}
for (const langId of spanishLatinAmericaLangIds) {
  if (resolveSpanishInstallerDefault(langId) !== 3082) {
    errors.push(`중남미 Windows UI LANGID ${langId}가 es-419 기술 별칭으로 연결되지 않습니다.`);
  }
}
for (const langId of [0, 9, 10, 1046, 9994, -1, 0x1_0000]) {
  if (resolveSpanishInstallerDefault(langId) !== null) {
    errors.push(`허용 목록 밖 LANGID ${langId}가 스페인어 설치 기본값으로 잘못 연결됩니다.`);
  }
}

const decoder = new TextDecoder("utf-8", { fatal: true });
async function readUtf8WithoutBom(filePath) {
  const bytes = await readFile(filePath);
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    errors.push(`${path.relative(repositoryRoot, filePath)}: UTF-8 BOM이 없어야 합니다.`);
  }
  try {
    return decoder.decode(bytes);
  } catch {
    errors.push(`${path.relative(repositoryRoot, filePath)}: 올바른 UTF-8이 아닙니다.`);
    return "";
  }
}

const [
  attributesText,
  template,
  hooks,
  configText,
  packageText,
  packageLockText,
  rustText,
  typescriptLocaleText,
] = await Promise.all([
  readUtf8WithoutBom(attributesPath),
  readUtf8WithoutBom(templatePath),
  readUtf8WithoutBom(hooksPath),
  readUtf8WithoutBom(configPath),
  readUtf8WithoutBom(packagePath),
  readUtf8WithoutBom(packageLockPath),
  readUtf8WithoutBom(rustPath),
  readUtf8WithoutBom(typescriptLocalePath),
]);

const attributeRules = new Set(
  attributesText
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\s+/gu, " "))
    .filter((line) => line && !line.startsWith("#")),
);
for (const rule of requiredAttributeRules) {
  if (!attributeRules.has(rule)) {
    errors.push(`.gitattributes: 필수 줄바꿈 규칙이 없습니다: ${rule}`);
  }
}
if (template.includes("\r")) {
  errors.push("src-tauri/installer/installer.nsi: LF 전용 줄바꿈 계약을 위반했습니다.");
}
if (hooks.includes("\r")) {
  errors.push("src-tauri/installer/hooks.nsh: LF 전용 줄바꿈 계약을 위반했습니다.");
}
const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);
const packageLock = JSON.parse(packageLockText);
const nsis = config.bundle?.windows?.nsis;
const expectedAppLocales = localeMappings.map(([, locale]) => locale);
const rustLocaleBlock =
  rustText.match(/const INSTALLER_LOCALES:[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
const rustLocales = [...rustLocaleBlock.matchAll(/"([^"]+)"/g)].map(
  (match) => match[1],
);
const typescriptLocaleBlock =
  typescriptLocaleText.match(/export type Locale\s*=([\s\S]*?);/)?.[1] ?? "";
const typescriptLocales = [...typescriptLocaleBlock.matchAll(/'([^']+)'/g)].map(
  (match) => match[1],
);

if (JSON.stringify(rustLocales) !== JSON.stringify(expectedAppLocales)) {
  errors.push("Rust 설치 언어 허용 목록이 NSIS 언어 매핑과 다릅니다.");
}
if (JSON.stringify(typescriptLocales) !== JSON.stringify(expectedAppLocales)) {
  errors.push("TypeScript 앱 언어 허용 목록이 NSIS 언어 매핑과 다릅니다.");
}

if (packageJson.devDependencies?.["@tauri-apps/cli"] !== "2.11.4") {
  errors.push("package.json: 고정 NSIS 템플릿과 같은 Tauri CLI 2.11.4를 정확히 고정해야 합니다.");
}
if (
  packageLock.packages?.[""]?.devDependencies?.["@tauri-apps/cli"] !== "2.11.4"
  || packageLock.packages?.["node_modules/@tauri-apps/cli"]?.version !== "2.11.4"
) {
  errors.push("package-lock.json: Tauri CLI 2.11.4 잠금이 고정 템플릿과 일치하지 않습니다.");
}

if (JSON.stringify(nsis?.languages) !== JSON.stringify(expectedLanguages)) {
  errors.push("tauri.conf.json: NSIS 12개 언어 목록이나 순서가 다릅니다.");
}
if (nsis?.displayLanguageSelector !== true) {
  errors.push("tauri.conf.json: 설치 언어 선택기가 활성화되지 않았습니다.");
}
if (nsis?.template !== "installer/installer.nsi") {
  errors.push("tauri.conf.json: 고정 NSIS 템플릿 경로가 다릅니다.");
}
if (nsis?.installerHooks !== "installer/hooks.nsh") {
  errors.push("tauri.conf.json: 설치기 훅 경로가 다릅니다.");
}
if (config.bundle?.licenseFile !== "installer/eula/en.txt") {
  errors.push("tauri.conf.json: 기본 EULA 경로가 다릅니다.");
}

expectContains(template, customInitialization, "신규 설치 언어 선택 조건");
expectContains(template, customLicensePage, "신규 설치 EULA 조건");
expectContains(template, customAllLanguages, "12개 설치 언어 전체 표시");
expectContains(template, customSkipFunction, "기존 설치 EULA 생략 함수");
expectContains(template, customLanguageRestore, "기존 설치 언어 복원 허용 목록");
expectContains(template, customSpanishLanguageAlias, "중남미 스페인어 선택기 기술 별칭");
expectContains(template, customSpanishDefaultFunction, "스페인어 Windows UI LANGID 안전 분기");
expectContains(template, customInstallPrelude, "실행 중인 앱 확인 후 설치 전 정리");
expectContains(hooks, "$ExistingInstall = 0", "기존 설치 seed 차단");
expectContains(hooks, "$UpdateMode <> 1", "자동 업데이트 seed 차단");
expectContains(hooks, "IfFileExists", "기존 seed 덮어쓰기 차단");
expectContains(hooks, managedInstallCleanup, "업데이트 앱 소유 파일 선별 정리");

const preinstallHook =
  hooks.match(/!macro NSIS_HOOK_PREINSTALL([\s\S]*?)!macroend/u)?.[1] ?? "";
if (/\$(?:APPDATA|LOCALAPPDATA)\\\$\{BUNDLEID\}/u.test(preinstallHook)) {
  errors.push("설치 전 정리 훅이 사용자 앱 데이터 경로를 건드리면 안 됩니다.");
}
if (/RMDir\s+\/r\s+"\$INSTDIR"/iu.test(preinstallHook)) {
  errors.push("설치 전 정리 훅이 설치 폴더 전체를 재귀 삭제하면 안 됩니다.");
}

for (const [language, locale, filename] of localeMappings) {
  expectContains(
    template,
    `LicenseLangString PcssakEula \${${language}} "\${PCSSAK_EULA_DIR}\\${filename}"`,
    `${locale} EULA 연결`,
  );
  if (locale !== "en") {
    expectContains(
      hooks,
      `$LANGUAGE = \${${language}}`,
      `${locale} NSIS 언어 연결`,
    );
    expectContains(
      hooks,
      `StrCpy $PcssakInstallerLocale "${locale}"`,
      `${locale} 앱 언어 연결`,
    );
  }
}

const eulaFiles = (await readdir(path.join(installerDirectory, "eula")))
  .filter((name) => name.endsWith(".txt"))
  .sort();
const expectedEulaFiles = localeMappings
  .map(([, , filename]) => filename)
  .sort();
if (JSON.stringify(eulaFiles) !== JSON.stringify(expectedEulaFiles)) {
  errors.push("설치기 EULA 12개 파일 목록이 언어 매핑과 다릅니다.");
}

let restored = template;
if (restored.startsWith(templateHeader)) restored = restored.slice(templateHeader.length);
else errors.push("고정 템플릿의 출처·수정 설명 머리말이 다릅니다.");
restored = replaceExactlyOnce(
  restored,
  "Var OldMainBinaryName\nVar ExistingInstall\n",
  "Var OldMainBinaryName\n",
  "기존 설치 변수 복원",
);
restored = replaceExactlyOnce(
  restored,
  customLicensePage,
  upstreamLicensePage,
  "라이선스 페이지 복원",
);
restored = replaceExactlyOnce(
  restored,
  customLicenseMappings,
  "",
  "EULA 언어 매핑 복원",
);
restored = replaceExactlyOnce(
  restored,
  customAllLanguages,
  "\n",
  "12개 설치 언어 전체 표시 복원",
);
restored = replaceExactlyOnce(
  restored,
  customLanguageRestore,
  "",
  "기존 설치 언어 복원 함수 복원",
);
restored = replaceExactlyOnce(
  restored,
  customSpanishLanguageAlias,
  "",
  "중남미 스페인어 선택기 기술 별칭 복원",
);
restored = replaceExactlyOnce(
  restored,
  customSpanishDefaultFunction,
  "",
  "스페인어 Windows UI LANGID 안전 분기 복원",
);
restored = replaceExactlyOnce(
  restored,
  customInitialization,
  upstreamInitialization,
  "초기화 분기 복원",
);
restored = replaceExactlyOnce(
  restored,
  customSkipFunction,
  "",
  "EULA 생략 함수 복원",
);
restored = replaceExactlyOnce(
  restored,
  customInstallPrelude,
  upstreamInstallPrelude,
  "설치 전 훅 순서 복원",
);
restored = replaceExactlyOnce(
  restored,
  customTemplateEndMarker,
  "\n",
  "공식 템플릿 마지막 개행 복원",
);
const upstreamSha256 = createHash("sha256").update(restored).digest("hex");
if (upstreamSha256 !== expectedUpstreamSha256) {
  errors.push(
    `Tauri CLI 2.11.4 원본 복원 SHA-256 불일치(실제 ${upstreamSha256}, ${restored.length}자)`,
  );
}
const embeddedUpstream = restored.endsWith("\n\n") ? restored.slice(0, -1) : restored;
const embeddedUpstreamSha256 = createHash("sha256").update(embeddedUpstream).digest("hex");
if (embeddedUpstreamSha256 !== expectedEmbeddedUpstreamSha256) {
  errors.push(
    `Tauri CLI 2.11.4 내장 템플릿 복원 SHA-256 불일치(실제 ${embeddedUpstreamSha256})`,
  );
}

if (errors.length > 0) {
  console.error(`설치 언어 정적 검증 실패 (${errors.length}건)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    "설치 언어 정적 검증 통과: 12개 언어·EULA, 신규/업데이트 분기, seed 보호, Tauri 2.11.4 최소 차이",
  );
}
