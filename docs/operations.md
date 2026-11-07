# 실행·검증·향후 운영 절차

이 문서는 로컬 실행과 배포 전 점검을 설명합니다. `main` 병합 없이 feature 브랜치를 반영하는 Jenkins 설정·호스트 설치 절차는 [Jenkins 문서](jenkins.md)를 따릅니다. 실제 설치·운영 배포 성공은 각 실행 결과로 확인합니다.

## 작업 브랜치

모든 작업은 `feature/<의미-있는-이름>`에서 진행합니다. 이번 기초 작업은 `feature/site-foundation`입니다. 예: `feature/github-admin-auth`, `feature/media-posts`. `codex/`나 무작위 코드 브랜치는 만들지 않습니다.

## 로컬 준비

```sh
node --version
npm ci
cp .env.example .env.local
npm run dev
```

Node.js는 24 이상을 사용하며 `.nvmrc`는 24를 지정합니다. `npm ci`는 커밋된 lockfile을 기준으로 의존성을 설치합니다. 이미 `.env.local`이 있으면 덮어쓰기 전에 내용을 확인합니다. 기본 개발 서버는 포트 3000이며 `dev` 스크립트는 `0.0.0.0`에 바인딩하므로, 신뢰하지 않는 네트워크에 노출하지 않습니다.

현재 앱이 사용하는 설정은 `SITE_URL`입니다. 로컬 기본값은 `http://localhost:3000`이고 sitemap의 절대 주소 생성에 사용됩니다. GitHub OAuth·DB 자격 증명은 아직 요구하거나 사용하지 않습니다.

## 검사 순서

```sh
npm run check
npm run build
npm run test:integration
```

- `npm run check`: ESLint → Next.js 타입 생성·TypeScript 검사 → Vitest. `typecheck`는 `next typegen && tsc --noEmit`이며 실패하면 다음 단계로 넘어가지 않습니다.
- `npm run build`: 빌드 식별자 생성 → Next.js standalone 빌드 → CSS·Markdown 복사.
- `npm run test:integration`: 먼저 생성한 standalone 런타임에서 `127.0.0.1`의 임시 포트에 서버를 시작하고 HTTP smoke test 후 종료합니다. 공개 미리보기나 배포가 아닙니다.
- `npm run test:deploy`: 실제 서비스 없이 압축 파일·브랜치·복구 절차 검사.

서버를 계속 실행하며 확인하려면 빌드 후 `npm start`를 실행합니다. 서버가 실행된 상태에서 **다른 터미널**로 요청 검사를 실행합니다.

```sh
SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke
```

Smoke test는 `SMOKE_BASE_URL`에 HTTP 요청을 보내며 서버를 직접 시작하지 않습니다. 생략하면 `http://localhost:3000`을 사용합니다. 개발 서버와 프로덕션 서버를 동시에 같은 포트로 시작하지 않습니다. 다른 포트를 사용할 때는 대상 URL도 맞춥니다. 검사 명령을 문서에 적었다는 사실과 실제 검사 통과는 다르며, 변경별 실행 결과를 따로 확인합니다.

HTTP 자동 검사는 화면의 레이아웃·시각 품질·실제 키보드 동작을 검증하지 않습니다. 현재 실제 브라우저의 시각 검증은 완료하지 않았습니다. 사용 중인 관리형 미리보기 실행기는 Next.js가 지원하지 않는 `--host`, `--strictPort` 인자를 추가하므로 이 경로의 미리보기 성공을 주장하지 않습니다.

수동 확인 항목:

- `/computer`: 검색, 태그 조합, 초기화, 결과 없음, 새로고침·뒤로 가기.
- 기술 글 상세, 없는 slug의 404, `draft` 글의 비노출.
- `/vrchat`, `/valorant`의 준비 중 안내와 실제로 동작하는 업로드·댓글 UI가 없다는 점.
- `/admin`·하위 경로 GET의 503, 변경 기능이 열리지 않았다는 점.
- `/portfolio` 직접 접근, 공용 메뉴·sitemap 제외, robots 메타·응답 헤더.
- 모바일 화면, 키보드 탐색, 폼 라벨, 본문 건너뛰기.

## 의존성 호환성과 보안 검사

ESLint는 `eslint-config-next` 플러그인의 현재 peer dependency 호환성을 위해 `9.39.5`로 고정합니다. 버전 변경 시 peer dependency와 `check`·`build` 결과를 함께 확인합니다.

`npm run check`에는 의존성 보안 감사가 포함되지 않습니다. `npm audit`로 전체 의존성을, 필요하면 `npm audit --omit=dev`로 운영 의존성을 별도 점검합니다. 호환성 검증 통과와 보안 경고 없음은 다른 확인 항목이며, 자동 강제 업그레이드보다 영향과 수정 가능 버전을 먼저 검토합니다.

## 저장소 CI

개발 의존성의 `@typescript-eslint/typescript-estree`가 사용하는 minimatch는 glob 패턴 처리 DoS 취약점(GHSA-g3hv-75wg-m249)을 피하도록 `11.0.5`로 한정 override했습니다. 상위 패키지가 수정 버전을 직접 채택하면 override 제거 여부를 검토합니다. 의존성 변경 후 전체 검사·빌드와 `npm audit`를 다시 실행합니다.

`.github/workflows/ci.yml`에는 `main`·`feature/**` push, pull request와 수동 실행을 위한 GitHub Actions 검사가 정의되어 있습니다. `npm ci` → `check` → `build` 후 CI 안에서 프로덕션 서버를 띄워 smoke test를 실행합니다. 배포 단계는 없으며 Jenkins 설정도 아닙니다. 워크플로 파일의 존재는 원격 CI가 실제 통과했다는 뜻이 아니므로 해당 커밋의 실행 결과를 별도로 확인합니다.

## 배포 전에 할 일: 아직 미수행

1. 실제 도메인과 HTTPS 종료 지점, 프록시·프로세스 실행 방식, 접근·에러 로그를 확인합니다.
2. **빌드 전에 `SITE_URL`을 실제 HTTPS origin으로 설정**하고 sitemap이 localhost를 가리키지 않는지 검사합니다.
3. 운영 Node.js와 lockfile 기준으로 위 검사·빌드·smoke test를 다시 수행합니다.
4. 비밀값은 저장소 밖의 서버/CI 비밀 저장소에 두고 빌드 산출물·브라우저 번들·로그에 노출되지 않게 합니다.
5. 장애 감지, 재시작, 백업, 이전 빌드로의 rollback 절차와 관리자 503 처리 방침을 정합니다.
6. 사용자 승인과 서버 환경 검토 후 실제 배포를 진행합니다.

Dockerfile·컨테이너 실행 환경은 포함하지 않습니다. Jenkinsfile과 Job 예제·고정 배포 도우미는 제공하며 호스트 적용은 [Jenkins 문서](jenkins.md)를 따릅니다. 로컬 실행 명령 자체는 운영 반영을 수행하지 않습니다.

## 기존 PostgreSQL 연결 전에 할 일: 아직 미수행

1. 서버 접근 권한, PostgreSQL 버전, 기존 앱·사용자·스키마와 데이터 소유 범위를 확인합니다.
2. **변경 전 백업을 만들고 별도 환경에서 복구 가능 여부를 검증**합니다. 백업 보관 위치와 접근 권한도 확인합니다.
3. 읽기 중심으로 현재 구조를 조사하고 기존 데이터에 미치는 영향을 검토합니다. 접속만으로 테이블 생성·삭제나 자동 마이그레이션을 실행하지 않습니다.
4. 최소 권한 계정, 암호화 연결, 연결 수 제한과 별도 개발·검증 환경을 준비합니다.
5. 필요한 스키마 변경과 rollback 계획을 검토한 뒤 명시적으로 승인된 범위만 적용합니다.

현재는 DB 드라이버·ORM·마이그레이션 파일·연결 문자열이 없습니다. 기존 DB가 이 코드와 호환된다고 가정하지 않습니다.

