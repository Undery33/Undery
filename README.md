# Undery

기술과 취미를 기록하는 개인 웹사이트입니다. `/`는 기존 Next.js 메인 화면을 제공하고 `/vrchat`에 선택한 GUI 브랜치의 화면을 적용합니다. Jenkins가 BuildKit으로 Next.js·Node.js·Nginx·VRChat GUI를 하나의 이미지로 빌드한 뒤 GHCR digest로 배포합니다. 실행·설정 방법은 [컨테이너 배포 문서](docs/container-deployment.md)를 기준으로 합니다.

- 저장소: [Undery33/Undery](https://github.com/Undery33/Undery) (공개)
- 기반: Next.js App Router, React, TypeScript, 파일 기반 Markdown
- 메인 앱·Dockerfile·Jenkinsfile: `feature/site-foundation`. VRChat GUI: `FEATURE_BRANCH`의 `dist/`이며 기본값은 `feature/vrchat-web-gui`입니다.
- 모든 작업은 `feature/site-foundation`, `feature/article-search`처럼 목적이 드러나는 `feature/` 브랜치에서 진행합니다. `codex/` 접두사와 무작위 코드 이름은 사용하지 않습니다.

## 현재 구현

| 경로 | 상태 |
| --- | --- |
| `/` | Computer, VRChat, Valorant 진입점 |
| `/computer` | Markdown 글 목록, URL 기반 검색(`q`)·태그(`tag`) 필터 |
| `/computer/[slug]` | 글 상세, Markdown 렌더링, 없는 글은 404 |
| `/vrchat` | 컨테이너에서 선택한 브랜치의 VRChat GUI 제공. Profile·Pictures·Gallery 화면 |
| `/valorant` | 준비 중 안내. 미디어 게시·댓글 없음 |
| `/admin`, `/admin/*` | GET 요청에 HTTP 503. 인증·관리 기능 없이 닫힌 상태 |
| `/portfolio` | 공용 메뉴와 분리한 소개 페이지 틀. 직접 URL로 접근 가능, `noindex` 적용 |
| `/api/health` | 컨테이너의 메인 앱 상태를 확인한 뒤 GUI·배포 설정 커밋 식별자 반환. `no-store` 적용 |

예제 글은 실제 개인 이력이나 활동이 아니며 화면에 예제로 표시됩니다.

**공개 범위 주의:** `noindex`와 메뉴에서 링크를 빼는 것은 접근 제어가 아닙니다. 포트폴리오는 로그인 없이 열 수 있습니다. `draft: true`는 웹사이트에서만 글을 숨깁니다. 공개 GitHub 저장소에 커밋한 초안과 변경 이력은 누구나 읽을 수 있으므로 비밀값·비공개 정보를 넣지 않습니다.

## 로컬 실행

Node.js 24 이상과 npm이 필요합니다. `.nvmrc`는 24를 지정합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. `.env.local`은 커밋하지 않습니다.

이 명령은 메인 Next.js 앱만 실행합니다. `/vrchat` GUI 연결은 컨테이너 Nginx에서 수행하므로 메인 앱 단독 개발 서버의 준비 중 화면과 구분합니다. 두 화면이 연결된 상태는 [컨테이너 빌드·검사](docs/container-deployment.md)로 확인합니다.

## 검증 및 프로덕션 모드 실행

```sh
npm run check
npm run build
npm run test:integration
npm start
```

`check`는 ESLint, Next.js 타입 생성과 TypeScript 검사(`next typegen && tsc --noEmit`), Vitest를 차례로 실행합니다. `build`는 빌드 식별자와 standalone 런타임을 생성하고 CSS·Markdown을 복사합니다. `test:integration`은 소스 checkout과 분리한 standalone 디렉터리에서 loopback 전용 임시 서버를 띄워 HTTP smoke test를 실행한 뒤 종료합니다. 먼저 `build`가 필요합니다. 배포 도우미의 별도 검사는 `npm run test:deploy`입니다.

`npm start`로 서버를 유지하며 확인할 때는 다른 터미널에서 다음 명령을 사용할 수 있습니다.

```sh
SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke
```

Smoke test는 서버를 자동으로 시작하지 않습니다. `SMOKE_BASE_URL`을 생략하면 `http://localhost:3000`을 사용합니다. 운영에 사용할 때는 **빌드 전에** `SITE_URL`을 실제 HTTPS 도메인으로 설정해야 합니다. 기본 localhost 값으로 만든 sitemap을 운영에 사용하지 않습니다.

의존성 보안 검사는 `npm audit`로 별도 확인합니다. HTTP 검사와 브라우저의 레이아웃·키보드 동작 검증은 각각 수행합니다.

## 아직 하지 않은 작업

- 서버 측 GitHub OAuth 로그인, 소유자 권한 검사와 관리자 작성 화면
- VRChat·Valorant 미디어 게시, 업로드와 방문자 댓글
- 기존 PostgreSQL 연결, 스키마 확인·마이그레이션
- 최종 디자인, 실제 포트폴리오·운영 콘텐츠

현재 DB 드라이버·ORM·OAuth 공급자·업로드 저장소는 연결하지 않았습니다. Jenkins는 `main` 병합 없이 메인 앱과 선택한 `feature/` 브랜치의 GUI를 함께 빌드합니다. `feature/vrchat-web-gui`의 새 커밋은 약 2분 SCM polling으로 감지한 뒤 검사·GHCR 게시·운영 배포를 자동 실행합니다. 배포 설정만 바뀌면 검사만 수행합니다. 수동 실행은 `DEPLOY=true`일 때 게시·배포하며 기본값 `false`는 검사 전용입니다. 실제 서버 적용에는 [Jenkins 설정과 배포 도우미 설치](docs/jenkins.md)가 필요합니다.

## 문서

- [구조와 보안 경계](docs/architecture.md)
- [실행·검증·향후 운영 절차](docs/operations.md)
- [Markdown 글 작성](docs/content-authoring.md)
- [feature 브랜치 Jenkins 빌드·배포](docs/jenkins.md)

