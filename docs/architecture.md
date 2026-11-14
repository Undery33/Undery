> 현재 Jenkins 배포는 BuildKit·GHCR 정적 GUI 이미지 방식으로 변경되었습니다. 배포 설정은 `feature/site-foundation`, 웹 소스는 `FEATURE_BRANCH`에서 별도로 가져옵니다. 아래 Next.js standalone 설명은 기존 앱 및 이전 운영 방식입니다. 현재 실행·설정 방법은 [컨테이너 배포 문서](container-deployment.md)를 기준으로 합니다.

# 구조와 보안 경계

## 현재 구조

```text
content/computer/                 기술 글 Markdown 원본
src/app/(public)/                홈·Computer·VRChat·Valorant와 공용 레이아웃
src/app/(public)/computer/[slug]/ 기술 글 상세
src/app/admin/[[...path]]/        기능을 차단한 관리자 응답
src/app/portfolio/               공용 메뉴와 분리한 포트폴리오
src/app/robots.ts                크롤러 안내
src/app/sitemap.ts               공개 경로·게시 글 sitemap
src/components/                 헤더, 글 카드, Markdown, 준비 중 안내
src/lib/articles.ts             파일 읽기·메타데이터 검증·검색·태그
src/lib/site.ts                 사이트 정보·공개 메뉴·SITE_URL 처리
scripts/smoke-test.mjs           실행 중인 서버의 HTTP 검사
scripts/verify-production.mjs    임시 loopback 서버 시작·검사·종료
.github/workflows/ci.yml         검사·빌드·smoke test, 배포 없음
Jenkinsfile                     선택한 feature 브랜치 검사·산출물 보관·선택적 배포
deploy/                         Jenkins Job 예제와 고정 배포 도우미
src/app/api/health/              실행 중인 빌드 식별자·상태
```

App Router의 서버 측 코드에서 `content/computer/*.md`를 읽습니다. 별도 API 서버나 데이터베이스는 없습니다. 글 상세는 게시 글의 경로를 빌드 시 생성하며, 콘텐츠 변경은 새 빌드를 통해 반영하는 방식으로 운영합니다. 검색은 URL의 `q`, `tag` 값을 받아 서버에서 처리하므로 링크 공유와 새로고침에도 조건이 유지됩니다.

## 콘텐츠 처리

- `gray-matter`로 front matter를 읽고 필수 텍스트, 날짜, 태그, 선택적 boolean 값을 검증합니다.
- slug는 영문 소문자·숫자·하이픈만 허용합니다. URL 입력을 파일 경로로 직접 연결하지 않습니다.
- `draft: true`인 글은 목록·상세·sitemap에서 제외합니다. 공개 저장소의 원본을 비공개로 만들지는 않습니다.
- `react-markdown`과 `remark-gfm`으로 렌더링합니다. 원시 HTML은 건너뛰며 MDX나 실행 가능한 사용자 컴포넌트를 지원하지 않습니다.
- 글은 작성자가 관리하는 저장소 콘텐츠입니다. 이 처리 경로를 향후 익명 댓글·업로드의 보안 검증 대신 사용하지 않습니다.

## 경계별 동작

### 관리자

현재 `/admin`과 하위 경로의 GET 요청은 HTTP 503, `Cache-Control: no-store`, 검색 제외 헤더를 반환합니다. 로그인 흉내, 클라이언트 상태에 의존하는 권한 판정, 콘텐츠 변경·업로드 기능은 없습니다. 503은 인증 기능의 대체물이 아니라 **미구현 상태를 닫아 둔 응답**입니다.

실제 관리자 기능을 열기 전에는 다음을 구현하고 검증해야 합니다.

1. 서버 측 GitHub OAuth authorization code 흐름과 등록된 callback 검증.
2. 로그인 흐름의 `state` 검증, CSRF 방어, PKCE 적용과 일회성·만료 처리.
3. `HttpOnly`, `Secure`, 적절한 `SameSite` 설정을 갖춘 쿠키 세션. 세션 만료·재발급·로그아웃·폐기를 서버에서 관리.
4. 변경 가능한 표시 이름 대신 GitHub의 안정적인 사용자 ID를 사용한 소유자 allowlist. 서버의 모든 읽기·변경 경로에서 권한 확인.
5. callback 위조, 다른 사용자 로그인, 세션 만료, 직접 API 호출, 재전송에 대한 거부 테스트.

OAuth 앱, 클라이언트 비밀값, 소유자 ID는 현재 설정하지 않았습니다. 공개 코드·브라우저 번들·로그에 자격 증명을 넣지 않습니다.

### 포트폴리오와 검색 노출

`/portfolio`는 공용 메뉴와 sitemap에서 제외되고 HTML robots 메타데이터와 `X-Robots-Tag`로 검색 제외를 요청합니다. 크롤러가 `noindex`를 읽을 수 있도록 robots.txt에서 포트폴리오 자체를 차단하지 않습니다.

이는 검색 엔진에 대한 요청일 뿐 접근 제한이나 삭제 보장이 아닙니다. 직접 URL을 아는 사람은 열 수 있고 링크가 외부에 공유될 수 있습니다. 비공개 자료를 다루려면 별도의 서버 측 인증·인가가 필요합니다.

### 향후 댓글·미디어

현재 댓글 입력·저장·업로드 엔드포인트는 없습니다. 추가 시 다음을 별도 설계합니다.

- 댓글은 검토·숨김·삭제가 가능한 moderation과 서버 측 rate limit, 길이 제한, 입력 검증을 적용합니다.
- 렌더링 시 XSS와 위험한 URL을 방지하고, 인증 방식에 맞게 CSRF·스팸 방어를 적용합니다.
- 업로드 파일은 신뢰하지 않습니다. 허용 형식·크기·실제 파일 형식 검증, 안전한 저장 키, 실행 불가 저장소, 접근 권한, 악성 파일 검사와 미디어 처리 한도를 마련합니다.
- 저장 위치, 삭제 정책, 백업·복구, 개인정보 노출 범위를 확정한 뒤 공개합니다.

## 향후 PostgreSQL·서버 연동

기존 PostgreSQL 재사용 여부는 서버와 스키마를 확인한 후 결정합니다. 현재 연결 문자열·DB 접근·마이그레이션은 없습니다. Jenkins는 선택한 feature 커밋의 standalone 산출물을 배포하도록 구성합니다. 실제 호스트 설치와 실행 조건은 [Jenkins 문서](jenkins.md)를 따릅니다. DB·미디어·서비스 자격 증명을 코드 배포에 포함하지 않습니다.

