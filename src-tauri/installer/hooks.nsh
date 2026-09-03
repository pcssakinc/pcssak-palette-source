; PCssak Palette 신규 설치 언어를 앱의 첫 실행으로 안전하게 전달합니다.
; 레지스트리를 새로 사용하지 않고 Tauri 앱 데이터의 고정 파일 하나만 기록합니다.

!define PCSSAK_EULA_DIR "${__FILEDIR__}\eula"

Var PcssakInstallerLocale

!macro NSIS_HOOK_PREINSTALL
  ; 업데이트·덮어 설치에서는 PCssak Palette가 관리하는 문서만 먼저 정리합니다.
  ; 사용자 팔레트와 설정이 있는 APPDATA·LOCALAPPDATA 경로 및 임의 파일은 건드리지 않습니다.
  ${If} $UpdateMode = 1
  ${OrIf} $ExistingInstall = 1
    Delete "$INSTDIR\EULA.md"
    RMDir /r "$INSTDIR\EULA"
    Delete "$INSTDIR\PRIVACY.md"
    Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 기존 설치, 직접 덮어 설치, 자동 업데이트에서는 사용자 언어를 절대 덮어쓰지 않습니다.
  ${If} $ExistingInstall = 0
  ${AndIf} $UpdateMode <> 1
    StrCpy $PcssakInstallerLocale "en"

    ${If} $LANGUAGE = ${LANG_KOREAN}
      StrCpy $PcssakInstallerLocale "ko"
    ${ElseIf} $LANGUAGE = ${LANG_JAPANESE}
      StrCpy $PcssakInstallerLocale "ja"
    ${ElseIf} $LANGUAGE = ${LANG_SIMPCHINESE}
      StrCpy $PcssakInstallerLocale "zh-Hans"
    ${ElseIf} $LANGUAGE = ${LANG_TRADCHINESE}
      StrCpy $PcssakInstallerLocale "zh-Hant"
    ${ElseIf} $LANGUAGE = ${LANG_FRENCH}
      StrCpy $PcssakInstallerLocale "fr"
    ${ElseIf} $LANGUAGE = ${LANG_GERMAN}
      StrCpy $PcssakInstallerLocale "de"
    ${ElseIf} $LANGUAGE = ${LANG_RUSSIAN}
      StrCpy $PcssakInstallerLocale "ru"
    ${ElseIf} $LANGUAGE = ${LANG_SPANISH}
      StrCpy $PcssakInstallerLocale "es"
    ${ElseIf} $LANGUAGE = ${LANG_SPANISHINTERNATIONAL}
      StrCpy $PcssakInstallerLocale "es-419"
    ${ElseIf} $LANGUAGE = ${LANG_PORTUGUESEBR}
      StrCpy $PcssakInstallerLocale "pt-BR"
    ${ElseIf} $LANGUAGE = ${LANG_TURKISH}
      StrCpy $PcssakInstallerLocale "tr"
    ${EndIf}

    SetShellVarContext current
    CreateDirectory "$APPDATA\${BUNDLEID}"
    IfFileExists "$APPDATA\${BUNDLEID}\installer-locale" pcssak_locale_seed_done

    ClearErrors
    FileOpen $0 "$APPDATA\${BUNDLEID}\installer-locale" w
    IfErrors pcssak_locale_seed_done
    FileWrite $0 "$PcssakInstallerLocale"
    FileClose $0
  ${EndIf}

  pcssak_locale_seed_done:
!macroend
