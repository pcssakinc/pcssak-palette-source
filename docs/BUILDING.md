# Building the source edition / 소스 빌드

These instructions are for the prepared public source snapshot. Before installation, confirm that src-tauri/tauri.conf.json uses com.pcssak.palette.source, the source-edition notices and no default official-updater feature. Do not apply these commands to an older internal checkout and assume those boundaries already exist.

공개 소스용 앱 식별자·설치 고지·업데이트 경계가 반영된 후보에 적용하는 안내입니다. 기존 설치본과 사용자 자료를 덮어쓰지 말고, 합성 자료와 별도 시험 환경을 사용하세요.

## Toolchain

- Node.js 24.18.0 and npm 11.16.0, matching .nvmrc and package.json.
- A Rust MSVC toolchain capable of building the locked dependencies. Cargo.toml's package minimum is not proof that every locked dependency builds with that minimum; record the exact rustc and cargo versions used.
- Microsoft C++ Build Tools with Desktop development with C++, Windows SDK and Microsoft Edge WebView2. Follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- Licence checks use cargo-about 0.9.1; supply-chain checks use cargo-deny 0.19.9.

For a clean build shell, confirm versions:

~~~powershell
node --version
npm --version
rustc --version
cargo --version
~~~

Install the two audit tools if needed; these commands download and execute build dependencies:

~~~powershell
cargo install cargo-about --version 0.9.1 --locked
cargo install cargo-deny --version 0.19.9 --locked
~~~

## Install, test and build

From the public snapshot root:

~~~powershell
npm ci --ignore-scripts
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
npm run licenses:check
cargo deny --manifest-path src-tauri/Cargo.toml check
npm run tauri -- build --bundles nsis
~~~

Run commands individually and stop if one fails. The first build may download Rust dependencies, WebView2 or NSIS tooling. Skipping npm lifecycle scripts reduces one installation risk; it does not make later builds or dependencies inherently safe. Do not remove failed checks simply to obtain an installer.

The default build uses the selected host target. An x86 application requires the i686-pc-windows-msvc target and a separate build/test cycle; do not interpret an x64 pass as x86 validation. Windows 10/11 installation, startup, updates and data preservation require testing beyond unit tests.

기본 소스 빌드에는 공식 배포용 개인키·인증서·업데이트 서명 비밀정보가 필요하지 않습니다. 공식 beta-updater 또는 store 기능을 이 기본 흐름에 추가하지 마세요. 자체 설치기는 공식 앱과 다른 식별자를 사용하지만 이것만으로 모든 데이터 충돌 가능성이 검증되었다고 단정할 수는 없습니다.

## Optional experimental features

The full implementation is present even when experimental UI is off. The internal-pro feature name is a retained development switch, not a restriction on GPL modification or redistribution. It does not activate a real purchase system and must not be combined with store. For a deliberate local experiment in PowerShell:

~~~powershell
$palettePreviousPro = [Environment]::GetEnvironmentVariable('PCSSAK_ALLOW_INTERNAL_PRO_BUILD', 'Process')
$palettePreviousUi = [Environment]::GetEnvironmentVariable('VITE_ENABLE_PRO_UI', 'Process')
try {
    $env:PCSSAK_ALLOW_INTERNAL_PRO_BUILD = 'INTERNAL_QA_ONLY'
    $env:VITE_ENABLE_PRO_UI = 'true'
    npm run tauri -- build --bundles nsis --features internal-pro
    if ($LASTEXITCODE -ne 0) { throw '실험 기능 빌드에 실패했습니다.' }
}
finally {
    [Environment]::SetEnvironmentVariable('PCSSAK_ALLOW_INTERNAL_PRO_BUILD', $palettePreviousPro, 'Process')
    [Environment]::SetEnvironmentVariable('VITE_ENABLE_PRO_UI', $palettePreviousUi, 'Process')
}
~~~

환경변수는 실험 뒤 원래 값으로 복원합니다. Pro 화면이 나타나는 것과 기능의 완성·실제 구매·접근성 효과 검증은 다릅니다. 결과물은 실험 빌드로 표시하고 중요한 사용자 자료를 넣지 마세요.

## Before distributing your build

Keep the GPL and third-party notices, record modifications and provide the source corresponding to the distributed binary under the applicable licences. Do not present a modified build as an official PCSSAK release or reuse the official update channel and signing credentials. A source build does not replace historical v0.1.8 assets.

Record the commit, dependency lockfiles, commands, operating system, architecture, passed checks and remaining limits. Unsigned installers may trigger Windows warnings; do not advise users to turn off security protections. See [COPYRIGHT.md](../COPYRIGHT.md) and [SECURITY.md](../SECURITY.md).
