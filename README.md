# Undery

기술과 취미를 기록하는 개인 웹사이트의 기초 구현입니다. 디자인과 실제 운영 콘텐츠는 이후 사용자 요구에 맞춰 정리합니다.

- 저장소: [Undery33/Undery](https://github.com/Undery33/Undery) (공개)
- 기반: Next.js App Router, React, TypeScript, 파일 기반 Markdown
- 모든 작업은 `feature/site-foundation`, `feature/article-search`처럼 목적이 드러나는 `feature/` 브랜치에서 진행합니다. `codex/` 접두사와 무작위 코드 이름은 사용하지 않습니다.

## 현재 구현

| 경로 | 상태 |
| --- | --- |
| `/` | Computer, VRChat, Valorant 진입점 |
| `/computer` | Markdown 글 목록, URL 기반 검색(`q`)·태그(`tag`) 필터 |
| `/computer/[slug]` | 글 상세, Markdown 렌더링, 없는 글은 404 |
| `/vrchat`, `/valorant` | 준비 중 안내만 제공. 미디어 게시·댓글 없음 |
| `/admin`, `/admin/*` | GET 요청에 HTTP 503. 인증·관리 기능 없이 닫힌 상태 |
| `/portfolio` | 공용 메뉴와 분리한 소개 페이지 틀. 직접 URL로 접근 가능, `noindex` 적용 |

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

## 검증 및 프로덕션 모드 실행

```sh
npm run check
npm run build
npm run test:integration
npm start
```

`check`는 ESLint, Next.js 타입 생성과 TypeScript 검사(`next typegen && tsc --noEmit`), Vitest를 차례로 실행합니다. `test:integration`은 기존 빌드로 loopback 전용 임시 프로덕션 서버를 띄워 HTTP smoke test를 실행한 뒤 서버를 종료합니다. 먼저 `build`가 필요합니다.

`npm start`로 서버를 유지하며 확인할 때는 다른 터미널에서 다음 명령을 사용할 수 있습니다.

```sh
SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke
```

Smoke test는 서버를 자동으로 시작하지 않습니다. `SMOKE_BASE_URL`을 생략하면 `http://localhost:3000`을 사용합니다. 운영에 사용할 때는 **빌드 전에** `SITE_URL`을 실제 HTTPS 도메인으로 설정해야 합니다. 기본 localhost 값으로 만든 sitemap을 운영에 사용하지 않습니다.

의존성 보안 검사는 `npm audit`로 별도 확인합니다. HTTP 검사만으로 브라우저 시각 검증을 대신하지 않으며, 실제 화면의 시각 검증은 아직 완료하지 않았습니다.

## 아직 하지 않은 작업

- 서버 측 GitHub OAuth 로그인, 소유자 권한 검사와 관리자 작성 화면
- VRChat·Valorant 미디어 게시, 업로드와 방문자 댓글
- 기존 PostgreSQL 연결, 스키마 확인·마이그레이션
- 개인 서버 접근, Jenkins 연동과 실제 배포
- 최종 디자인, 실제 포트폴리오·운영 콘텐츠

현재 DB 드라이버·ORM·OAuth 공급자·업로드 저장소를 연결하지 않았고, Docker/Jenkins 배포 구성을 제공하지 않습니다. 서버 파일과 자격 증명은 나중에 별도로 확인합니다.

## 문서

- [구조와 보안 경계](docs/architecture.md)
- [실행·검증·향후 운영 절차](docs/operations.md)
- [Markdown 글 작성](docs/content-authoring.md)
