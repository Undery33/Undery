# 메시지 관리자 로그인

메시지 관리는 기존 GitHub 소유자 로그인과 PostgreSQL 인증 표를 재사용합니다. 새 비밀번호·사용자 계정·인증 공급자를 만들지 않습니다. 기존 배포 릴리스의 `/api/auth/github`, callback, logout 구현과 `public."AdminIdentity"`, `public."AdminLoginAttempt"`, `public."AdminSession"`의 실제 열·기본값·인덱스를 읽어 호환 계약을 확인했습니다. 현재 기초 앱에서 닫혀 있던 로그인 경로만 복원하며, 다른 기존 관리자 기능은 열지 않습니다.

## 운영 설정

기존 보호된 앱 설정에서 다음 키를 서버 내부에서 전달합니다. 값을 Git, 이미지, 브라우저 코드, Jenkins 매개변수, 명령행, 채팅에 출력하지 않습니다.

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: 기존 GitHub OAuth 앱.
- `ADMIN_GITHUB_ID`: 기존 관리자의 변하지 않는 숫자 GitHub 사용자 ID. 표시 이름이나 로그인 이름으로 권한을 부여하지 않습니다.
- `SITE_URL`: 실제 공개 HTTPS origin. 현재 대상은 `https://undery.link`입니다.
- 기존 DB 설정: `BIRTHDAY_MEMO_DATABASE_URL`, `DATABASE_URL`, 또는 기존 `PGHOST`·`PGDATABASE`·`PGUSER`와 pg 접속 설정. 메모와 같은 기존 데이터베이스의 연결 풀을 사용합니다.

설정이 없거나 origin이 유효하지 않으면 로그인·관리 기능을 열지 않습니다. 임의의 URL, 프록시 Host 헤더나 요청의 `returnTo` 값을 redirect 대상으로 사용하지 않습니다. 개발 환경의 localhost HTTP만 예외적으로 허용하며 운영 환경은 HTTPS여야 합니다.

기존 OAuth callback은 `https://undery.link/api/auth/github/callback`입니다. OAuth 앱 설정이 이 주소와 일치하는지 운영자가 실제 로그인으로 확인해야 합니다. 비밀번호나 PAT를 대신 입력하지 않습니다.

## 경로와 보안 계약

- 관리자 화면은 `/birthday/memo/admin`과 `/vrchat/admin`입니다. 설정된 경우 `/admin`은 메시지 관리로 이동합니다. VRChat 화면은 로그인과 로그아웃 요청에 `?section=vrchat`을 사용하며 서버가 정한 고정 경로로 돌아옵니다. 로그인 시작 위치는 브라우저에 바인딩된 state의 해시에 포함됩니다.
- 로그인 시작: 같은 origin의 `fetch`에서 `POST /api/auth/github`, `credentials: same-origin`, `Accept: application/json`. 성공 JSON의 `redirectTo`는 서버가 생성한 GitHub 인증 URL이며 브라우저가 그 주소로 이동합니다.
- callback: `GET /api/auth/github/callback`. state·로그인 브라우저 쿠키·만료 시간을 함께 검사하고 PostgreSQL `DELETE ... RETURNING`으로 한 번만 소비합니다. HEAD로 state를 소비하지 않습니다.
- 로그아웃: 같은 origin의 `fetch`에서 `POST /api/auth/logout`, `Accept: application/json`, `application/x-www-form-urlencoded` 본문의 `csrfToken`. 세션과 같은 origin·CSRF를 검사한 뒤 그 세션만 폐기하고 고정 경로 `/birthday/memo/admin`을 JSON `redirectTo`로 반환합니다.
- 관리 API의 모든 읽기는 서버에서 세션과 소유자 ID를 확인합니다. 모든 변경은 여기에 `Origin`과 `X-CSRF-Token` 검사도 적용합니다. `Sec-Fetch-Site: cross-site`와 `same-site`는 거부합니다.

로그인 시 state, 브라우저 바인딩, PKCE verifier를 각각 32바이트 난수로 생성합니다. GitHub 공식 [OAuth 웹 흐름](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)에 맞춰 S256 PKCE를 사용하고, 새 저장소 접근 scope를 요청하지 않습니다. provider redirect를 따라가지 않고, HTTP와 본문 읽기에 10초 제한·JSON 크기 제한을 둡니다. GitHub API에서 검증한 숫자 ID만 기존 관리자 ID와 비교하며 provider 토큰은 저장하지 않습니다.

운영 쿠키 이름은 기존과 같은 `__Host-undery-login`, `__Host-undery-session`입니다. 둘 다 `Secure; HttpOnly; SameSite=Lax; Path=/`이며 Domain을 지정하지 않습니다. 로그인 시도는 10분, 세션은 8시간입니다. 쿠키의 원문은 43자 base64url이며 DB에는 SHA-256 해시만 기록합니다. 세션 재발급 시 해당 브라우저의 이전 세션을 폐기하고 다른 유효 세션은 유지합니다. 시간 열은 기존 timestamp without time zone 형식에 맞춰 UTC를 명시합니다.

로그인 시도는 기존 메모 rate-limit 표에 별도 `admin_login` bucket으로 제한합니다. 분당 클라이언트 10회·전체 60회이며 원문 IP는 저장하지 않습니다. 2일이 지난 로그인 제한 카운터는 다음 허용된 로그인 시도 때 정리합니다. `X-Undery-Client-IP`는 기존 신뢰 프록시 설정이 있을 때만 이용합니다.

`no-referrer` 문서 정책에서 브라우저의 일반 form POST는 `Origin: null`이 될 수 있어 관리자 버튼은 fetch 전송을 사용합니다. 서버의 정확한 Origin 검사와 CSRF 검사를 완화하지 않습니다. JSON을 요청하지 않는 기존 호출의 303 응답 계약은 유지하며, 쿠키 설정·폐기는 JSON과 303 모두 동일합니다.

## 배포 경계

기존 Nginx의 전체 GET/HEAD 제한을 무조건 해제하지 않습니다. `/api/auth/github`, `/api/auth/logout`과 승인된 메시지 관리 변경 경로에서만 POST를 허용해야 합니다. `/api/auth/`에서도 host가 전용 client IP 헤더를 덮어쓰고, callback query에 code/state가 있으므로 access log와 URL을 포함하는 upstream error log를 기록하지 않습니다. HTTPS, no-store, no-referrer, noindex 헤더를 두 프록시 계층에서 확인합니다. callback query나 Cookie/Authorization 헤더를 진단 로그에 출력하지 않습니다.

기존 public 인증 표의 스키마 변경은 필요 없습니다. 새 `AdminIdentity.id`에는 UUID를 명시하며 기존 계정 행은 변경하지 않습니다. 기존 `githubUserId` unique index를 이용합니다. runtime DB 역할은 확인된 기존 인증 표 접근 권한을 사용합니다.

## 검증과 장애 구분

`tests/admin-auth.test.ts`는 설정 누락, 안전하지 않은 origin, 미인증·다른 계정·만료 세션, 중복 쿠키, 위조 CSRF, 다른 브라우저의 state, callback 재전송·만료, PKCE, 잘못된 provider 응답·redirect·크기·읽기 시간 제한, 실패 시 rollback과 로그아웃을 검사합니다. 이 단위 검사는 실제 GitHub 승인 화면이나 실제 운영 DB 쓰기를 대신하지 않습니다.

- 503: 환경 키 존재 여부·실제 DB 연결·기존 public 인증 표 권한을 먼저 확인합니다. 비밀값은 출력하지 않습니다.
- 로그인 시작 403: 공개 origin, HTTPS와 프록시 전달, 요청 Origin·Sec-Fetch-Site가 일치하는지 확인합니다.
- 로그인 시작 405: host와 컨테이너의 해당 POST 경로 허용을 확인합니다.
- callback 후 로그인 실패 안내: OAuth 앱 callback 주소, 브라우저 쿠키, 10분 만료, 동일 state 재사용, GitHub 계정의 숫자 ID를 구분합니다. code/state 원문을 복사해 로그에 남기지 않습니다.
- 관리자 변경 401/403: 로그인 만료와 CSRF/Origin 불일치를 구분합니다. 다시 로그인 후 같은 실제 관리 동작으로 재검증합니다.

배포 완료 판정에는 실제 관리자의 GitHub 로그인·새로고침 후 세션 유지·메시지 조회·테스트 전용 메시지 변경·로그아웃 후 직접 API 거부 확인이 필요합니다. 확인하지 않은 단계는 남은 검증으로 명시합니다.
