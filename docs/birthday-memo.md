# 생일 월드 공용 방명록

글은 `https://undery.link/birthday/memo` 아래의 전용 경로에서 처리합니다. 기존 메인 페이지와 `/vrchat` 소개 페이지는 그대로 둡니다. 저장은 **기존 Undery PostgreSQL 데이터베이스**의 `birthday_memo` 스키마를 사용합니다. 메모리·컨테이너 파일·별도 SQLite로 대체하지 않습니다.

## 사용자 흐름과 API

월드의 펜 위에서 닉네임과 메시지 입력 → 생성 → 등록용 URL 복사·붙여넣기 → 저장 영수증 확인 → 큰 벽 새로고침 순서입니다. 웹페이지는 조회 전용입니다. 입력한 닉네임은 인증된 VRChat 계정명이 아닙니다.

| 요청 | 응답 / 동작 |
| --- | --- |
| `GET /birthday/memo/prepare` | `{ok:true, token, expiresAt}`. 암호학적 난수 32바이트를 64자리 소문자 hex로 반환합니다. 유효기간 10분. |
| `GET /birthday/memo/submit?token=...&nickname=...&message=...` | URL의 각 값은 UTF-8 percent encoding. 성공 `{ok:true, duplicate, entry}`. `entry`는 `{id,nickname,message,createdAt}`. |
| `GET /birthday/memo/feed?page=0&order=oldest` | `{ok:true,revision,entries,page,pageSize,total,totalPages,hasMore,order}`. 0부터 시작, 페이지당 150개. |
| `GET /birthday/memo` | 글 목록과 이전·다음 페이지. 웹 작성 기능은 제공하지 않습니다. |

`id`와 `revision`은 문자열입니다. 날짜는 ISO 8601 UTC 문자열입니다. `order` 기본값은 `oldest`이며 `newest`도 허용합니다. 월드에는 `order=oldest`의 정적 URL 목록을 미리 넣습니다. 150개 초과 글은 다음 HTTP 페이지로 읽으며 서버에서 삭제하지 않습니다. 월드에 미리 넣은 URL 개수보다 페이지가 많아지면 추가 URL을 넣어 다시 업로드해야 합니다. 웹 목록에는 같은 제한이 없습니다.

제출 성공은 HTTP 200과 `ok:true` 및 **일치하는 영수증**을 받은 경우에만 표시합니다. 토큰 row lock과 게시판 transaction advisory lock으로 중복 및 동시 제출을 처리합니다. 동일 토큰·동일 내용 재전송은 같은 `id`를 반환하고, 내용을 바꾸면 HTTP 409입니다. 사용한 토큰의 영수증은 만료 이후에도 재확인할 수 있습니다. 만료된 미사용 토큰은 410입니다.

오류 형식은 `{ok:false,error:"코드",message:"한국어 안내"}`입니다. `error`는 문자열입니다. 429에는 `Retry-After: 60`이 있습니다. 입력을 보존하고 같은 등록 주소로 다시 확인하면 통신 실패 후 중복 저장을 피할 수 있습니다.

닉네임은 공백 또는 보이지 않는 문자만 있으면 거절합니다. 닉네임 24자, 메시지 300자 제한은 Unicode scalar 기준입니다. 빈 메시지는 허용합니다. JS/.NET의 trim과 개행 처리 차이로 영수증 비교가 깨지지 않도록 서버는 유효한 닉네임·메시지의 원문을 바꾸지 않습니다. HTML은 글자로 표시합니다.

## 기존 DB 연결과 적용

환경 변수 우선순위:

1. `BIRTHDAY_MEMO_DATABASE_URL`
2. 기존 `DATABASE_URL`
3. 기존 `PGHOST`, `PGDATABASE`, `PGUSER` 및 필요한 `PGPORT`, `PGPASSWORD`, `PGSSLMODE`, `PGCONNECT_TIMEOUT`

현재 pg 드라이버는 `PGSSLROOTCERT`, `PGSSLCERT`, `PGSSLKEY` 환경 변수를 직접 읽지 않습니다. 인증서 기반 TLS가 필요한 운영 환경은 드라이버가 지원하는 연결 문자열 옵션과 인증서 경로를 별도로 검증해야 합니다. 인증서 검증을 끄는 설정으로 연결 실패를 우회하지 않습니다.

환경 값은 보호된 서버 파일이나 비밀 관리 기능으로 주입하며 저장소에 커밋하지 않습니다. URL이나 비밀번호를 명령 인자·채팅·로그에 적지 않습니다. DB 설정이 없거나 테이블이 준비되지 않았으면 503을 반환합니다. 시작이나 GET 요청으로 마이그레이션을 자동 적용하지 않습니다.

`BIRTHDAY_MEMO_ENABLED=false`는 임시 점검용으로 모든 방명록 요청을 닫습니다. `BIRTHDAY_MEMO_TRUST_PROXY=true`는 아래 프록시 구성을 완료한 뒤에만 켭니다. 설정하지 않으면 요청들이 공용 제한 버킷을 사용합니다.

운영자가 이미 사용하는 PostgreSQL 접속 환경을 로드한 후 실제 대상 DB를 먼저 확인합니다.

```sh
psql -X -v ON_ERROR_STOP=1 -c 'SELECT current_database(), current_user, version();'
psql -X -v ON_ERROR_STOP=1 -f src/lib/birthday-memo-migration.sql
```

마이그레이션은 기존 DB에 스키마·표·인덱스만 추가하고 기존 표를 변경하지 않습니다. 앱 DB 계정과 적용 계정이 다르면 앱 계정에 해당 스키마의 `USAGE`, entries의 `SELECT, INSERT`, tokens/rate_limits의 `SELECT, INSERT, UPDATE, DELETE`, 해당 identity sequence의 권한을 부여해야 합니다. 계정명은 실제 운영 설정에서 확인합니다. 데이터베이스 전체 권한을 추가하지 않습니다.

## 프록시와 로그

VRChat에서 사용자 입력 URL을 불러오는 제약 때문에 제출만 의도적으로 GET을 사용합니다. HEAD, 알려진 prefetch/prerender 요청은 제출과 토큰 생성을 실행하지 않습니다. 등록 주소는 외부에 공유하지 않습니다.

제출 URL에는 공개 메모 내용과 토큰이 포함됩니다. **호스트 Nginx와 컨테이너 Nginx 모두** `/birthday/memo` 및 하위 경로의 query-bearing access log와 upstream error log를 남기지 않아야 합니다. 앱은 SQL 예외 원문·URL·메시지·토큰을 로그에 쓰지 않습니다. 이 경로를 외부 분석·추적 서비스에 보내지 않습니다.

호스트 프록시는 `X-Undery-Client-IP`를 실제 연결의 `$remote_addr`로 덮어씁니다. 컨테이너 Nginx는 이 헤더만 내부 Next에 전달합니다. 컨테이너 공개 포트는 loopback 전용이어야 합니다. 외부에서 Next나 컨테이너 포트에 직접 접속할 수 있으면 `BIRTHDAY_MEMO_TRUST_PROXY=true`를 사용하면 안 됩니다. 앱은 임의 `X-Forwarded-For`를 신뢰하지 않습니다.

요청 제한은 PostgreSQL에 보관하며 클라이언트 버킷당 분당 60회, 전체 분당 240회입니다. prepare와 submit은 별도입니다. IP 원문은 저장하지 않고 제한용 해시만 보관합니다. 미사용 만료 토큰은 하루 뒤, 제한 기록은 이틀 뒤 정리합니다. 게시글과 사용한 토큰 영수증은 자동 삭제하지 않습니다.

## 검증

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
npm run test:memo:http
```

실제 PostgreSQL 통합검사는 **기존 DB를 가리키는** `BIRTHDAY_MEMO_TEST_DATABASE_URL`을 보호된 환경으로 전달한 뒤 실행합니다. 테스트는 무작위 `birthday_memo_test_<12자리 hex>` 스키마만 만들고 finally에서 정리합니다. 운영 `birthday_memo` 표를 비우거나 수정하지 않습니다. 역할에 임시 스키마 생성 권한이 없으면 운영자 관리하에 실행합니다.

```sh
npm test -- --run tests/birthday-memo-postgres.test.ts
```

설정이 없으면 이 테스트는 명시적으로 skip됩니다. 단위검사나 skip은 실제 DB 검증을 대신하지 않습니다. 통합검사는 Unicode 원문, 영수증 재조회, 동시 중복 등록, 만료, 재연결 후 보존, 150개 경계와 오래된 순서, 트랜잭션 순서를 검사합니다. `test:memo:http`는 DB 설정을 제거한 임시 loopback 서버로 실제 하위 경로, 리다이렉트 없음, 공란 차단과 DB 미연결 시 안전한 실패를 검사하며 DB 저장 성공을 의미하지 않습니다.

실제 월드 검증은 별도로 합니다. A가 작성·URL 붙여넣기·저장 완료 확인 후 퇴장 → 그 글을 보지 못한 B가 새 인스턴스 생성 → 같은 글 조회를 확인해야 합니다. 빈/공백 닉네임, 한글·이모지·개행, 연타, 응답 손실 뒤 같은 URL 재시도, URL 허용 설정 꺼짐, 서버 중단, 사이트 재배포 후 복원도 확인합니다. 확인하지 않은 항목은 남은 검증으로 기록합니다.

| 증상 | 구분할 확인 | 대응 |
| --- | --- | --- |
| 404 | 실제 전체 경로와 운영 빌드 확인 | 하위 경로가 Next로 전달되는지, 최신 앱이 배포됐는지 확인 |
| 400 `nickname_required` | 닉네임 공백·보이지 않는 문자 여부 | 보이는 닉네임 입력; 메시지는 유지 |
| 409 `token_used` | 같은 URL의 내용이 바뀌었는지 | 새 생성으로 새 주소 발급 |
| 410 | 발급 후 10분 경과 또는 유효하지 않은 주소 | 입력 유지 후 새 주소 발급 |
| 429 | 같은 네트워크 또는 전체 요청량 | 60초 뒤 재시도; 무작정 URL 재발급 금지 |
| 503 | DB 연결, 권한, 마이그레이션, 점검 설정 | 실제 오류를 보호된 서버에서 진단하고 정상 닉네임으로 재검증 |
| 웹 조회는 되지만 VRChat 실패 | 신뢰하지 않는 URL 설정·Udon download error code | URL 허용과 정확한 HTTPS 주소 확인; 실패를 저장 성공으로 표시하지 않음 |
| 최신 글이 다음 종이에 없음 | feed의 `totalPages`와 월드에 등록한 정적 URL 수 | 누락 페이지와 배치 표시를 확인; 서버 데이터를 삭제하지 않음 |

## 백업과 복구

코드 롤백은 DB 데이터를 삭제하지 않습니다. 점검 시 기능을 닫고 이전 앱 버전으로 돌아갈 수 있습니다. 마이그레이션을 되돌린다는 이유로 스키마를 자동 삭제하지 않습니다.

기존 운영 DB 접속 환경에서 `pg_dump --format=custom --schema=birthday_memo --file=<보호된 백업 경로>`로 일관된 백업을 생성합니다. 백업에는 게시글과 영수증이 있으므로 공개 저장소에 넣지 않습니다. `pg_restore --list <백업>`으로 포함 대상을 확인합니다. 복구는 현재 데이터의 추가 백업과 유지보수 시간을 확보한 뒤 해당 스키마만 대상으로 수행해야 합니다. 전체 DB나 다른 스키마에 `--clean`을 적용하지 않습니다. 복구 후 실제 글·id·영수증 조회와 새 등록 및 다른 인스턴스 표시를 재검증합니다.

운영 PostgreSQL 재시작, 서버 재부팅, 실제 VRChat의 서로 다른 계정·인스턴스 검증은 자동 테스트 성공만으로 완료 처리하지 않습니다.
