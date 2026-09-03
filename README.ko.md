# PCSSAK Palette — 소스 공개판

[English](README.md) · [빌드](docs/BUILDING.md) · [기여](CONTRIBUTING.ko.md) · [보안](SECURITY.ko.md)

Palette는 팔레트를 만들고 글자·배경 대비를 검토하는 도구입니다. 색각이상 당사자가 스스로 디자인을 결정하도록 돕는 것을 중요한 목표로 삼고, 실제 사용자의 경험을 바탕으로 개선합니다.

## 여기서 시작하세요 — 사용·질문·작은 참여

**[제작자의 첫 인사와 함께 만드는 이야기](https://github.com/pcssakinc/pcssak-palette-source/discussions/1)** — 더 쉬워졌으면 하는 작업 한 가지를 알려 주세요. 코딩을 몰라도 괜찮으며 어떤 언어든 환영합니다.

| 하고 싶은 일 | 시작하는 곳 |
| --- | --- |
| 기존 윈도우 프로그램 사용 | [공식 다운로드와 버전 안내](https://github.com/pcssakinc/pcssak-palette-releases/releases) |
| 질문·사용 경험·아이디어 공유 | [커뮤니티 대화](https://github.com/pcssakinc/pcssak-palette-source/discussions) |
| 작은 소스·문서 개선에 참여 | [처음 참여하기 좋은 과제](https://github.com/pcssakinc/pcssak-palette-source/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) · [기여 안내](CONTRIBUTING.ko.md) |
| 보안 취약점 제보 | 공개 댓글이 아닌 [비공개 보안 제보](SECURITY.ko.md) |

기존 설치본과 이 소스는 서로 다른 릴리스입니다. 재현 가능한 오류는 앱 버전을 적어 [설치본 제보](https://github.com/pcssakinc/pcssak-palette-releases/issues)에, 소스 커밋을 적어 [소스 제보](https://github.com/pcssakinc/pcssak-palette-source/issues)에 남겨 주세요. 진단서·실명·개인 이미지는 필요하지 않으며 공유 전 개인정보를 제거해 주세요.

## 공개 범위

색각이상 지원과 과거 유료·Pro용으로 준비한 코드를 포함한 Palette 전체 구현을 공개합니다. 비밀키·개인자료·타제품·내부 운영 기록은 제외합니다. 소스 공개가 미완성 기능의 완성을 뜻하지는 않습니다. 기존 internal-pro 빌드 선택은 실험 기능을 명시적으로 시험하는 장치이며, 구매나 공식 유료 서비스 이용권을 뜻하지 않습니다.

PCSSAK는 한 명의 개발자가 AI의 도움을 받아 개발·운영합니다. 검토와 배포 판단의 책임은 관리자에게 있습니다. 제3자 오픈소스와 공개 색채 연구를 활용하며, 모든 코드와 알고리즘을 PCSSAK이 독자 발명했다고 주장하지 않습니다.

## 사용 범위와 한계

- Windows 데스크톱이 대상입니다. x64·x86 앱은 각각 시험해야 하며 Windows 10/11의 모든 에디션·업데이트·설치 경로 검증을 뜻하지 않습니다.
- 색각 미리보기는 근사치입니다. 의료 진단·개인의 실제 지각 예측·접근성 인증이 아닙니다. 글자·아이콘 등 비색상 단서를 함께 사용하고 실제 사용자와 검토해 주세요.
- 소스 빌드는 별도 앱 식별자 com.pcssak.palette.source를 사용하며 기본값으로 공식 자동 업데이트에 참여하지 않습니다. 기존 설치본이나 데이터를 덮어쓰는 용도로 사용하지 마세요.
- 시험 결과는 명시한 소스와 환경에만 해당합니다. 이후 변경이나 모든 배포 파일의 안전성 보증이 아닙니다.

## 원본·다운로드·배포

이 저장소에는 내부 작업 원본에서 선정·검증한 Palette 소스를 공개합니다. 내부 커밋이 자동으로 공개되는 구조가 아닙니다. 외부 변경 제안도 검토를 거치며 공식 릴리스에 자동으로 복사되지 않습니다.

기존 설치 파일은 [Palette Releases](https://github.com/pcssakinc/pcssak-palette-releases/releases)에 있습니다. 이번 소스 공개만으로 기존 v0.1.8 바이너리의 라이선스가 자동 변경되거나 기존 자산·고지·업데이트가 교체되는 것은 아닙니다. 받은 배포본에 명시된 라이선스와 소스 안내를 확인하세요.

직접 빌드한 설치기는 미서명일 수 있습니다. 출처와 제공된 해시를 확인하되 이를 안전성 보증으로 해석하지 마세요. 설치를 위해 SmartScreen·Defender 등 보안 기능을 끄지 마세요.

## 라이선스와 참여

공개 소스에 포함된 PCSSAK 자체 기여에는 동봉된 [LICENSE](LICENSE)의 GPL-3.0-only를 적용합니다. 정확한 범위는 [COPYRIGHT.md](COPYRIGHT.md)를 따르며 제3자 권리·라이선스는 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)에 별도로 보존합니다.

적용 라이선스 조건을 지키는 무료·유료 재배포를 허용합니다. 의무 로열티·판매 사전 연락·원본 저장소로의 수정 제출 의무는 없습니다. 연락과 후원은 자발적입니다. 단순 사용으로 만든 일반 팔레트·디자인 결과물에 PCSSAK 표시 의무를 추가하지 않습니다.

언어에 관계없이 [커뮤니티 대화](https://github.com/pcssakinc/pcssak-palette-source/discussions)로 질문·경험을 나눠 주세요. 재현 가능한 소스 문제와 정리된 과제는 [소스 이슈](https://github.com/pcssakinc/pcssak-palette-source/issues), 기존 설치본 문제는 [Palette 배포 이슈](https://github.com/pcssakinc/pcssak-palette-releases/issues)를 이용하세요. 게시 전에 [개인정보 안내](docs/PRIVACY.md)를 확인하고, 취약점은 [비공개 보안 경로](SECURITY.ko.md)를 이용하세요.
