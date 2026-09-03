# 공개 변경 검사 경계

이 자동검사는 GitHub가 제공하는 일회성 Windows Server 2025 x64 러너에서 실행합니다.
개인 PC·내부망·자체 호스팅 러너를 외부 변경 제안 검사에 연결하지 않습니다.
Windows 10/11의 설치·실행·업데이트·x86 앱 전체 시험을 대신하지 않습니다.

- 이벤트는 main 대상 변경 제안과 main 반영입니다. 저장소 내용 읽기만 허용합니다.
- 체크아웃 인증정보를 작업 트리에 남기지 않고, npm 자동 캐시와 작업 간 공유 캐시를 사용하지 않습니다.
- Rust 의존성과 검사 도구는 새 러너에서 받을 수 있어야 합니다. 의존성이 없는 새 러너에 오프라인 전용 시험을 요구하지 않습니다.
- 공개 파일 경계, 프런트엔드 시험, 라이선스·설치 안내·빌드, Rust 시험과 공급망을 검사합니다.
- 실제 설치기 생성·서명·업데이트·배포·산출물 업로드는 하지 않습니다.
- 개인키·배포 인증정보·개인자료·원시 개인 로그를 러너에 넣거나 공개 로그에 출력하지 않습니다.
- 외부 코드 자체가 로그나 네트워크 요청을 만들 수 있습니다. 낮은 권한은 위험을 줄일 뿐 악성 코드를 안전한 코드로 바꾸지는 않습니다.

관리자는 외부 제안을 실행하기 전에 워크플로 변경을 검토하고 GitHub의 외부 기여 실행 승인 설정을 확인해야 합니다.
이 파일만으로 해당 설정·브랜치 보호·필수 검사가 활성화되지는 않습니다.
CODEOWNERS 담당자도 실제 쓰기 권한이 있어야 작동하며, 작성자는 자신의 변경 제안을 승인할 수 없습니다.
외부 제안 검사에 비밀정보나 쓰기 권한을 추가해 실패를 해결하지 마세요.

## 고정된 공식 작업

2026-09-03 GitHub 공식 저장소의 최신 릴리스와 태그가 가리키는 커밋을 확인했습니다.

- [actions/checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1): 3d3c42e5aac5ba805825da76410c181273ba90b1
- [actions/setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0): 820762786026740c76f36085b0efc47a31fe5020

두 작업은 Node.js 24 실행기를 사용하므로 최신 GitHub 호스팅 러너를 전제로 합니다.
고정 SHA도 영구적인 안전성 보증은 아니며 새 보안 권고·버전 변경 때 다시 검토합니다.
고정 릴리스·태그 이름은 참고이고 실제 실행은 전체 커밋 SHA를 따릅니다.

근거: [GitHub 안전한 작업 사용](https://docs.github.com/en/actions/reference/security/secure-use),
[CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners),
[Windows 러너 구성](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md).
