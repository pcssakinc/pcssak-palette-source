fn main() {
    println!("cargo:rerun-if-env-changed=PCSSAK_ALLOW_INTERNAL_PRO_BUILD");

    if std::env::var_os("CARGO_FEATURE_INTERNAL_PRO").is_some()
        && std::env::var("PCSSAK_ALLOW_INTERNAL_PRO_BUILD").as_deref() != Ok("INTERNAL_QA_ONLY")
    {
        panic!(
            "internal-pro는 내부 QA 전용입니다. 명시적으로 확인한 빌드에서만 \
             PCSSAK_ALLOW_INTERNAL_PRO_BUILD=INTERNAL_QA_ONLY를 설정하세요."
        );
    }

    if std::env::var_os("CARGO_FEATURE_INTERNAL_PRO").is_some()
        && std::env::var_os("CARGO_FEATURE_STORE").is_some()
    {
        panic!("internal-pro와 store 기능은 같은 빌드에서 사용할 수 없습니다.");
    }

    tauri_build::build()
}
