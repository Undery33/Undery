# 본인 메시지 삭제와 비밀 코드

방문자는 등록한 메시지의 비밀 코드로 해당 메시지만 휴지통으로 이동할 수 있습니다. 원문·ID·등록시간·등록 영수증은 PostgreSQL에 보존하고 기존 관리자 화면의 휴지통에서 조회·복구합니다. 외부 로그인이나 VRChat 표시 이름을 소유권 근거로 사용하지 않습니다.

## 월드와 서버 계약

1. 월드는 기존 prepare → submit 흐름에서 성공 영수증의 ID와 사용한 토큰을 함께 보존합니다. 비밀 코드 형식은 `BM1.<entryId>.<token>`입니다. `entryId`는 선행 0 없는 양의 10진수 문자열, `token`은 prepare에서 받은 64자리 소문자 hex입니다. 서버가 새 비밀을 발급하는 단계는 없습니다.
2. 작성자는 비밀 코드를 개인적으로 복사해 둡니다. 재입장 후 코드를 붙여 넣으면 해당 글의 삭제 주소를 다시 만들 수 있습니다. 이름을 입력하거나 같은 표시 이름으로 접속하는 것만으로 권한을 복구하지 않습니다. 이전 글도 원래 등록 URL/토큰과 ID를 보유한 경우에만 이 방식으로 삭제할 수 있습니다.
3. 사용자가 삭제를 확인할 때 새로운 32자리 소문자 hex `requestId`를 만듭니다. 128비트 난수 식별자이며 인증 비밀은 아닙니다. 한 번 생성한 삭제 주소의 통신 재시도에서는 같은 ID를 유지합니다. 응답 손실이나 자동 재시도를 이유로 새 ID를 만들지 않습니다.
4. Udon 사용자 입력 URL 제약에 맞춰 생성한 삭제 주소를 사용자가 URL 입력란에 붙여 넣고 실행합니다. 코드·주소는 공개 텍스트, 동기화 변수, PlayerData, 분석/오류 로그에 기록하지 않습니다. 같은 월드의 다른 플레이어에게 노출될 수 있는 VRChat 영속 데이터는 소유 비밀 저장소로 사용하지 않습니다.

`GET /birthday/memo/delete?entryId=<id>&token=<64hex>&requestId=<32hex>&confirm=trash`

네 필드가 모두 필요하며 중복·알 수 없는 필드를 거부합니다. `entryId` 최대값은 PostgreSQL bigint의 `9223372036854775807`입니다. 입력 검증 후 소유권을 확인합니다. 성공 HTTP 200:

```json
{"ok":true,"duplicate":false,"entryId":"123","status":"deleted","moderationRevision":"7"}
```

`status`는 응답 트랜잭션 시점의 `deleted`, `hidden`, `visible` 중 하나입니다. `duplicate:true`는 이 요청 ID를 이전에 처리했다는 뜻입니다. 관리자 복구 후 같은 주소를 다시 실행하면 `hidden` 또는 `visible`을 반환하고 메시지는 그대로 둡니다. 클라이언트는 `ok:true`만으로 현재 삭제 완료라고 표시하지 말고, 일치하는 `entryId`와 `status`를 확인해야 합니다. 이후 관리자가 변경하면 다음 feed에서 더 높은 `moderationRevision`을 읽어 표시를 갱신합니다.

새 요청으로 이미 삭제된 메시지를 지정하면 HTTP 200, `duplicate:false`, `status:deleted`이며 변경번호·행 버전·이력을 중복 증가시키지 않습니다. 이 요청도 영수증으로 남아 나중의 관리자 복구를 취소하지 않습니다. 복구된 글을 다시 의도적으로 삭제하려면 새 요청 ID를 생성해야 합니다.

비밀 코드를 가진 사람은 해당 글을 삭제할 수 있습니다. 이 코드는 VRChat 계정에 암호학적으로 묶인 인증이 아니며 분실 시 닉네임으로 재발급할 수 없습니다. 공유하거나 다른 플레이어가 볼 수 있는 곳에 표시하지 않습니다. 관리자 작성 글처럼 소유 토큰이 없는 글은 방문자 API로 삭제하지 못합니다.

## 저장·권한·동시성

원래 토큰의 SHA-256 해시와 `tokens.entry_id` 연결이 소유권을 증명합니다. 이미 등록에 사용된 토큰은 최초 등록 유효기간 10분이 지나도 삭제 권한을 유지합니다. 미사용 토큰, 다른 글의 토큰, 존재하지 않는 토큰은 모두 같은 403 오류입니다. 입력 닉네임, VRChat playerId, 관리자 ID를 받아 권한을 부여하지 않습니다.

변경은 하나의 트랜잭션에서 게시판 advisory lock → 토큰 비잠금 조회 → 글 행 잠금 순서로 실행합니다. 관리자와 같은 게시판/행 순서를 사용하며 submit의 토큰→게시판 순서와 교착하지 않도록 토큰 잠금을 추가하지 않습니다. 소유 토큰의 글 연결은 등록 후 불변이며 소비된 토큰은 정리 대상이 아닙니다.

- `owner_deletion_requests`: 요청 ID, 글 ID, 토큰 해시, 생성시간. 요청 ID가 다른 글/토큰에 재사용되면 409입니다. 관리자 복구 후 예전 주소가 다시 활성화되지 않도록 이 영수증을 만료·정리하지 않습니다.
- `owner_events`: 실제 상태 변경의 글 ID, 요청 ID, `trash`, 행 버전, 시간만 보관합니다. 이름/본문/비밀/토큰 해시/IP/URL을 넣지 않으며 GitHub `management_events.actor_id`를 가장하지 않습니다.
- `entries`: `status=deleted`, `version+1`, `updated_at`만 변경합니다. 실제 상태 변경 때 `board_state.moderation_revision`도 증가합니다. 기존 관리자 휴지통 및 공개 feed 필터를 그대로 사용합니다.

GET은 VRChat 제약을 위한 의도적인 상태 변경입니다. HEAD는 405, 알려진 prefetch/prerender는 400이며 상태를 바꾸지 않습니다. 모든 응답은 no-store/noindex/no-referrer입니다. 클라이언트와 서버의 일반 로그에 요청 URL이나 비밀을 기록하지 않습니다. 기존 호스트/컨테이너 프록시의 `/birthday/memo` 하위 경로 로그 차단이 delete에도 적용되는지 배포 시 확인합니다. 토큰 URL을 브라우저 기록이나 외부 사이트에 남기지 않습니다.

delete 전용 DB 요청 제한은 클라이언트 분당 60회/전체 240회이고, 형식이 유효하지만 권한이 없는 요청도 집계합니다. 기존 trusted-proxy 계약을 따르며 임의 X-Forwarded-For를 신뢰하지 않습니다.

## 명시적 적용과 복구

1. 현재 앱 버전, 실제 DB/역할, 메모 스키마 버전 2를 확인합니다. 보호된 메모 스키마 백업을 만든 후 `pg_restore --list`와 전체 디코딩으로 검증합니다. 적용 전 글 행수·ID/내용/상태 지문, 원본 영수증 수, 게시판 변경번호를 기록하되 원문·토큰을 공용 로그에 출력하지 않습니다.
2. 기존 DB에 `src/lib/birthday-memo-owner-deletion-migration.sql`을 운영 연결 환경으로 명시적으로 적용합니다. HTTP/앱 시작에서 실행하지 않습니다. 이 버전 3 마이그레이션은 v2를 요구하며 두 표/관련 인덱스와 마이그레이션 번호만 추가합니다. 기존 글·토큰·인증 표를 갱신하거나 삭제하지 않습니다.
3. 앱 역할이 적용 역할과 다르면 실제 역할명을 확인한 후 새 표/sequence에만 다음 권한을 부여합니다. 아래 `app_role`은 실제 역할명으로 치환하고 비밀번호를 명령 인자에 적지 않습니다. 기존 v2의 schema USAGE, tokens SELECT, entries SELECT/UPDATE, board_state SELECT/UPDATE, rate_limits SELECT/INSERT/UPDATE 권한은 유지합니다.

```sql
GRANT SELECT, INSERT ON birthday_memo.owner_deletion_requests TO app_role;
GRANT INSERT ON birthday_memo.owner_events TO app_role;
GRANT USAGE ON SEQUENCE birthday_memo.owner_events_id_seq TO app_role;
```

4. 변경 전후 기존 글·영수증 지문과 수, 변경번호가 동일한지 검증하고 새 표/권한/버전 3을 확인합니다. 그런 다음 새 앱을 배포합니다. 이 GET 경로는 기존 `/birthday/memo/` 프록시 라우팅 안에 있으므로 별도 POST 허용 목록을 넓히지 않습니다.
5. 공개 feed 정상 응답, 무권한 삭제 403, HEAD/prefetch 무변경, 관리자 인증 유지부터 확인합니다. 실제 삭제 동작은 명시적으로 마련한 테스트 글로만 검증하고 기존 운영 글을 임의로 수정하지 않습니다. 서버 재시작/재배포와 실제 VRChat 재입장·다른 인스턴스 반영은 별도 검증합니다.

장애 시 v3 앱을 상태를 이해하는 v2 앱으로 되돌리면 본인 삭제 기능만 사라지고 휴지통 내용은 보존됩니다. 추가 표나 영수증을 지우지 않습니다. v1 앱은 상태를 필터링하지 않으므로 공개 기능 중단 없이 되돌리면 안 됩니다. DB 복원은 현재 데이터의 추가 백업 후 유지보수 시간에 수행하며 다른 스키마를 정리하지 않습니다.

## 검증과 오류 구분

입력/라우트 단위검사와 `tests/birthday-memo-owner-deletion-postgres.test.ts`의 실제 PostgreSQL 검사를 함께 실행합니다. DB 검사는 무작위 `birthday_memo_test_<12hex>` 전용 스키마만 만들고 제거합니다. 토큰 소유권, 같은 이름의 다른 작성자 거부, 만료 후 재연결, 원문 보존, 동시 중복 요청, 관리자 복구 후 재시도, 새 요청의 재삭제, 이미 삭제된 글, 요청 ID 충돌, 트랜잭션 롤백, 잠금 순서, 요청 제한, 마이그레이션 재실행을 검사합니다. DB 환경이 없으면 기존 테스트 관례에 따라 skip되며, 그 결과는 실제 DB 통과가 아닙니다.

```sh
node node_modules/vitest/vitest.mjs run tests/birthday-memo-owner-deletion.test.ts tests/birthday-memo-owner-deletion-routes.test.ts
# BIRTHDAY_MEMO_TEST_DATABASE_URL을 보호된 프로세스 환경으로 전달한 후:
node node_modules/vitest/vitest.mjs run tests/birthday-memo-postgres.test.ts tests/birthday-memo-management-postgres.test.ts tests/birthday-memo-owner-deletion-postgres.test.ts
```

| 응답/증상 | 확인과 대응 |
| --- | --- |
| 400 `invalid_delete_request` | 코드 형식, ID/토큰/요청 ID 길이, `confirm=trash` 확인 후 주소를 다시 생성 |
| 403 `delete_forbidden` | 원래 등록 토큰과 ID가 같은 글의 것인지 확인. 닉네임/관리자 로그인으로 우회하지 않음 |
| 409 `delete_request_conflict` | 다른 글에 같은 요청 ID를 재사용했는지 확인 후 의도적인 새 삭제 주소 생성 |
| 429 | 60초 후 같은 주소 재시도. 새 ID로 제한을 우회하지 않음 |
| 503 | 보호된 서버에서 DB 연결·v3 마이그레이션·새 표 권한·잠금 상태 확인. 코드/주소는 보존하되 로그에 출력하지 않음 |
| `duplicate:true`, `status:hidden/visible` | 관리자 복구 이후의 현재 상태. 삭제 완료로 표시하지 않으며 자동 재삭제하지 않음 |
| HTTP 성공 후 월드에 계속 보임 | feed의 상태 필터와 moderationRevision/클라이언트 캐시 갱신 확인 |

각 오류를 해결한 뒤 원래 등록 글과 코드로 동일 요청을 재검증하고 관리자 휴지통/공개 피드의 실제 결과까지 확인합니다. 단위검사, 로컬 DB 통과, 운영 배포, 실제 VRChat 검증은 서로 다른 완료 범위입니다.
