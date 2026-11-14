# BuildKit · GHCR · Jenkins 배포

## 브랜치와 실행 위치

| 대상 | 위치 | 역할 |
| --- | --- | --- |
| Next.js 메인 앱 · Dockerfile · Nginx · Jenkinsfile · 배포 스크립트 | `feature/site-foundation` | 메인 화면과 배포 설정의 단일 기준 |
| VRChat HTML · CSS · JavaScript · 이미지 | `FEATURE_BRANCH`의 `dist/` | 기본 `feature/vrchat-web-gui`, `/vrchat`에 연결 |
| BuildKit | Jenkins `site-ci`의 rootless Docker | 이미지를 한 번 빌드하고 실제 컨테이너 검사 |
| 이미지 저장소 | `ghcr.io/undery33/undery` | 검사한 이미지 게시 |
| 운영 실행 | `site-deploy`가 호출하는 고정 root helper | GHCR digest를 pull해 Next.js·Nginx 컨테이너 실행 |
| GitHub Actions | 별도 검증 러너 | Dockerfile·Nginx·배포 코드 검사 전용. 이미지 게시·운영 배포 안 함 |

Jenkins Job의 **Pipeline from SCM Branch Specifier**는 `refs/heads/feature/site-foundation`으로 고정합니다. GUI 브랜치를 Job SCM에 넣지 않습니다. Jenkinsfile은 메인 앱·배포 설정과 GUI의 작업 디렉터리를 나누고 각 checkout SHA를 기록합니다. GUI 브랜치의 Jenkinsfile·npm 스크립트·Dockerfile은 실행하지 않습니다.

main을 checkout·merge·push하는 단계가 없습니다. PR #1도 초안·미병합으로 유지합니다. `FEATURE_BRANCH`는 유효한 `dist/index.html`과 로컬 정적 리소스를 가진 GUI 브랜치를 지정합니다. `feature/site-foundation`의 Next.js 메인은 항상 함께 포함되므로 GUI 브랜치 변경이 `/`를 대체하지 않습니다.

| URL | 제공 방식 |
| --- | --- |
| `/`, `/computer`, `/valorant`, `/portfolio`, `/admin` | 컨테이너 Nginx가 내부 Next.js `127.0.0.1:3001`로 전달 |
| `/vrchat`와 GUI 리소스 | 선택한 GUI 브랜치의 정적 파일을 Nginx가 제공 |
| `/vrchat/` | query를 보존한 상대 경로 `/vrchat`로 308 redirect |
| `/api/health` | 내부 Next.js 상태 확인이 성공한 경우에만 GUI·메인 앱 커밋 정보 반환 |

## 한 번 준비할 호스트 설정

서버 관리자가 저장소의 다음 스크립트를 검토한 뒤 실행합니다.

```sh
sudo sh deploy/install-rootless-builder.sh
sudo sh deploy/install-container-helper.sh
```

첫 스크립트는 **site-ci 전용 rootless Docker**를 설정합니다. 필요한 Docker rootless 도구·uidmap·slirp4netns와 subordinate UID/GID가 없으면 설치를 중단합니다. 호스트의 기존 Docker를 끄거나 Jenkins를 docker 그룹에 넣지 않습니다.

두 번째 스크립트는 고정 배포 helper와 site-deploy 전용 sudo 규칙을 설치합니다. 설치 자체로 운영 서비스를 중단하거나 배포하지 않습니다.

이전에 Nginx 전용 helper를 설치했다면 `sudo sh deploy/install-container-helper.sh`를 다시 실행해 갱신합니다. 새 helper는 `/usr/local/bin/node /opt/undery/container-entrypoint.mjs`를 고정 실행해 Next.js와 Nginx를 함께 시작합니다. 기존 파일은 백업되며 rootless builder·GHCR 로그인·권한을 다시 설정할 필요는 없습니다.

Jenkins 전역 Credentials에 다음을 등록합니다. 토큰을 채팅·Git·Jenkins 파라미터에 넣지 않습니다.

- 종류: Username with password
- ID: `ghcr-undery-push`
- Username: GHCR 소유 계정
- Password: `write:packages` 권한이 있는 GitHub PAT classic

private GHCR 이미지 pull용 별도 `read:packages` PAT를 호스트에서 등록합니다. 입력은 대화형 password prompt에서 수행합니다.

```sh
sudo docker --config /etc/undery-ghcr login ghcr.io -u Undery33
```

이미지가 public이면 익명 pull이 가능하므로 pull 토큰은 필요 없습니다. 저장소가 public이어도 새 GHCR 패키지의 공개 상태가 자동으로 public이라고 가정하지 않습니다. 이 작업은 패키지 공개 범위를 자동으로 바꾸지 않습니다. Jenkins push 토큰은 임시 Docker 설정에만 저장하고 종료 시 제거합니다. root pull 설정은 관리자 전용 경로에 저장합니다.

## Birthday 메모의 기존 PostgreSQL 연결

이 기능은 기존 프로젝트의 PostgreSQL을 사용합니다. 배포 helper는 DB나 Docker 네트워크를 새로 만들거나 DB 내용을 바꾸지 않습니다. 관리자에게 실제 DB 이름·접속 역할·DB 컨테이너 DNS 이름·기존 사용자 정의 bridge 네트워크를 확인하고, 메모 테이블의 검토된 마이그레이션을 먼저 적용해야 합니다. 호스트의 `127.0.0.1:5432`는 웹 컨테이너 자신의 루프백 주소와 다릅니다. 임시 컨테이너 IP를 접속 주소로 고정하지 않습니다.

호스트 관리자는 다음 두 파일을 **함께** 준비합니다. 저장소·이미지·Jenkins 매개변수에 비밀번호를 넣지 않습니다.

| 경로 | 내용 |
| --- | --- |
| `/etc/undery/birthday-memo.env` | 실제 PostgreSQL 접속 설정과 기능 스위치 |
| `/etc/undery/birthday-memo-runtime.json` | `{"network":"실제로 확인한 기존 네트워크 이름"}` 형태의 JSON. `network` 이외 키는 허용하지 않음 |

JSON의 한국어 설명값은 그대로 사용할 설정값이 아닙니다. 기존 DB 컨테이너가 연결된 사용자 정의 Docker bridge의 실제 이름으로 바꿉니다. helper는 해당 네트워크의 존재·이름·bridge 드라이버를 확인하며 `host`, `none`, 기본 `bridge` 네트워크는 허용하지 않습니다. DB가 기본 bridge에만 있다면 관리자가 기존 데이터 볼륨을 유지한 상태에서 사용자 정의 네트워크와 DB DNS 별칭을 별도로 준비해야 합니다. helper가 이 작업을 대신하지 않습니다.

두 파일은 root 소유의 일반 파일이고 권한은 `0600` 또는 `0400`이어야 하며 심볼릭 링크를 허용하지 않습니다. `/etc`와 `/etc/undery`도 root 소유이며 다른 사용자에게 쓰기 권한이 없어야 합니다. `/etc/undery`의 `0750` 또는 `0700`은 허용합니다. JSON은 4 KiB, 환경 파일은 64 KiB까지 읽습니다. 기존 파일이 있으면 변경 전에 관리자 전용 위치에 백업하고, 내용이 완성된 파일을 원자적으로 교체합니다.

환경 파일의 권장 키는 다음과 같습니다. 값은 Docker env-file의 리터럴 값이므로 `export`, 셸 확장, 값을 감싸는 셸 따옴표를 사용하지 않습니다. 비밀번호를 포함한 URL을 명령행이나 채팅에 쓰지 말고 관리자 편집기나 기존 비밀 설정 관리 방식으로 입력합니다.

- `BIRTHDAY_MEMO_DATABASE_URL`: 기존 DB의 실제 PostgreSQL 연결 URL. DB 역할은 메모 기능에 필요한 권한만 사용합니다.
- `BIRTHDAY_MEMO_ENABLED=true`: 메모 기능 사용. `false`는 기능을 잠시 중단할 때 사용합니다.
- `BIRTHDAY_MEMO_TRUST_PROXY=true`: 검토된 호스트 Nginx가 직접 설정하고 컨테이너 Nginx가 전달하는 전용 `x-undery-client-ip` 헤더를 신뢰합니다. 외부 입력을 그대로 신뢰하는 프록시에서는 켜지 않습니다.

기존 설정을 재사용해야 할 때는 `DATABASE_URL`, 또는 `PGHOST`·`PGDATABASE`·`PGUSER`와 `PGPORT`, `PGPASSWORD`, `PGSSLMODE`, `PGCONNECT_TIMEOUT`도 허용합니다. 현재 DB 드라이버가 자동으로 읽지 않는 `PGSSLROOTCERT`, `PGSSLCERT`, `PGSSLKEY`는 거부합니다. TLS 인증서 연결이 필요하면 드라이버가 지원하는 연결 문자열 옵션과 컨테이너 내부 인증서 경로를 별도로 검토해야 하며, 이 연결을 위해 TLS 검증을 끄지 않습니다. `NODE_OPTIONS`, `LD_PRELOAD`, 알려지지 않은 키, 중복 키, 등호가 없는 키는 거부합니다. 환경 파일의 내용이나 DB URL을 배포 로그에 출력하지 않습니다.

두 파일이 모두 없으면 기존 배포 동작을 그대로 사용합니다. 하나만 있거나 권한·구문이 틀리면 운영 컨테이너를 변경하기 전에 중단합니다. 후보와 운영 컨테이너에는 같은 고정 env-file과 네트워크를 전달하며, 배포 중 설정이 바뀌면 중단하고 이전 런타임을 복원합니다. 이전 컨테이너의 DB 환경과 네트워크는 rollback 과정에서 그대로 보존됩니다.

기능이 켜진 경우 기존 `/api/health`의 커밋 검증에 더해 후보·호스트 루프백·공개 HTTPS에서 `/birthday/memo/feed?page=0&order=oldest`를 읽어 HTTP 200과 정상 JSON 목록 응답을 확인합니다. DB 접속이나 테이블이 준비되지 않으면 새 운영 전환을 완료하지 않습니다. 이 검사는 글을 등록하지 않습니다. 기능을 명시적으로 `false`로 끈 경우 DB 목록 검사는 생략합니다.

마지막으로 실제 URL 복사·붙여넣기 등록, 같은 토큰 재시도, 조회, 작성자가 없는 새 VRChat 인스턴스 표시를 별도 확인해야 합니다. 단위 테스트나 후보 목록 조회 성공만으로 이 검증까지 완료됐다고 판단하지 않습니다.

## Jenkins 실행

기존 `Undery_Feature`의 SCM을 위 고정 브랜치로 변경합니다. 전체 Job 예시는 `deploy/jenkins-job.xml`에 있습니다. 저장소 URL은 `https://github.com/Undery33/Undery.git`, Script Path는 `Jenkinsfile`, Lightweight checkout은 끕니다.

```text
FEATURE_BRANCH=feature/vrchat-web-gui
DEPLOY=false  # 수동 실행은 빌드와 검사만
DEPLOY=true   # 수동 실행도 검사 후 GHCR 게시와 운영 반영
```

`DEPLOY=false`는 수동 실행 기본값입니다. **SCM 자동 실행에서 `feature/vrchat-web-gui`가 직전 성공 빌드의 GUI 커밋과 달라지면 검증 후 자동 게시·배포합니다.** 배포 설정만 변경되었거나 GUI 비교 이력이 없으면 검사만 수행합니다. 수동 실행과 다른 feature 브랜치의 배포는 `DEPLOY=true`로 지정합니다. 메인 앱과 선택한 GUI를 포함한 운영 이미지 한 개를 교체하며 브랜치별 preview URL은 만들지 않습니다.

2분 SCM polling은 배포 설정과 고정된 `feature/vrchat-web-gui`의 변경을 감시합니다. 다른 feature 브랜치를 수동 빌드해도 GUI 감시 기준은 유지합니다. 두 checkout의 Git 이력이 섞이지 않도록 Job·배포 설정은 `.git`으로 끝나는 URL을 사용하고 GUI 감시는 같은 저장소의 `https://github.com/Undery33/Undery`와 `ScmName=undery-web-source`를 사용합니다. Git plugin의 `BuildData` 선택은 remote URL 문자열을 기준으로 하므로 remote 이름이나 `ScmName`만 분리해서는 충분하지 않습니다. 변경 없는 두 SHA가 반복 빌드를 일으키면 SCM Poll Log에서 각 checkout의 기준 SHA를 확인합니다.

`deploy/deployment-policy.py`가 실행 원인·브랜치·현재 및 이전 GUI SHA로 `auto`·`manual`·`check` 모드를 결정합니다. 자동 실행에는 GUI 비교 이력이 필요하며 수동 `DEPLOY=false`는 새 커밋이어도 게시하지 않습니다. GitHub webhook 추가 설정은 필요하지 않으며 push 후 다음 polling 주기와 빌드 시간이 지나면 반영됩니다.

## 이미지 생성과 전환

1. GUI 소스 SHA와 메인 앱·배포 설정 SHA를 각각 고정합니다.
2. `prepare-container-context.py`가 검증한 메인 앱·배포 설정과 GUI `dist/` 파일을 별도 이미지 컨텍스트로 복사합니다. `.env`·자격 증명·심볼릭 링크·외부 경로를 이미지에 포함하지 않습니다.
3. `docker buildx build --load`로 BuildKit 빌드를 수행합니다. Node.js 24 빌드 단계에서 Next.js standalone을 생성하고 최종 이미지에 Node.js·Nginx·GUI를 함께 넣습니다. 고정 supervisor가 Next.js `127.0.0.1:3001`과 Nginx `8080`을 UID/GID `101:101`로 실행합니다.
4. 동일 이미지에 read-only filesystem·cap-drop·no-new-privileges를 적용해 기존 메인·Computer·portfolio·관리자 차단과 `/vrchat` GUI·CSS·JS·PNG·health·404·HTTP 메서드를 검사합니다.
5. 검사한 이미지 ID를 확인한 뒤 GHCR에 게시합니다. 태그는 소스 SHA와 배포 설정 SHA를 모두 포함합니다.
6. GHCR의 `sha256` digest를 기록하고 **digest로만** 운영 helper에 전달합니다. 운영 서버에서는 이미지를 다시 빌드하거나 소스를 합치지 않습니다.
7. helper가 source·revision·branch·pipeline revision 라벨을 확인하고 별도 loopback 포트에서 후보를 먼저 실행합니다.
8. 후보가 정상이면 이전 런타임을 멈추고 호스트 `127.0.0.1:3000`을 새 컨테이너의 Nginx `8080`에 연결합니다. 기존 호스트 Nginx의 HTTPS proxy와 인증서는 계속 사용합니다.
9. loopback·운영 HTTPS의 커밋 식별 검사 실패 시 이전 컨테이너 또는 기존 systemd 서비스를 복구합니다.

컨테이너에 호스트 디렉터리나 Docker socket을 마운트하지 않습니다. 기존 Next 릴리스 파일은 삭제하지 않습니다. `/`의 메인 화면과 Computer·portfolio·관리자 차단 동작을 유지하며 새 GUI는 `/vrchat`에만 적용합니다. rollback은 보관한 이전 컨테이너를 원래 실행 명령으로 다시 시작하므로 기존 Nginx 전용 이미지도 복원할 수 있습니다.

`/api/health` 응답은 GUI 소스의 `commit`·`branch`와 메인 앱·배포 설정의 `pipelineCommit`을 구분합니다. 내부 Next.js가 응답하지 않으면 Nginx도 성공 상태를 반환하지 않습니다. 이미지 digest는 별도 값이며 Jenkins `release.json`에서 확인합니다.

## 검증 한계

CI의 이미지 검사 성공은 실제 서버 전환 완료를 뜻하지 않습니다. Jenkins 로그인·GHCR Credentials·rootless builder·새 helper 준비 후 수동 `DEPLOY=true` 또는 조건을 충족한 SCM 자동 배포와 운영 상태 확인이 모두 성공해야 배포 완료입니다. 강제 장애나 서버 재부팅을 실제로 발생시키는 시험은 별도입니다.

## 출처

- [Docker BuildKit](https://docs.docker.com/build/buildkit/)
- [Docker rootless mode](https://docs.docker.com/engine/security/rootless/)
- [Buildx container driver](https://docs.docker.com/build/builders/drivers/docker-container/)
- [GitHub Container registry 인증과 권한](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Jenkins GitSCM: getKey·isRelevantBuildData·getBuildData](https://github.com/jenkinsci/git-plugin/blob/master/src/main/java/hudson/plugins/git/GitSCM.java)
- [Jenkins BuildData: hasBeenReferenced](https://github.com/jenkinsci/git-plugin/blob/master/src/main/java/hudson/plugins/git/util/BuildData.java)
- [Jenkins Git plugin: 이전 성공 커밋 변수](https://plugins.jenkins.io/git/#environment-variables)
- [Jenkins Pipeline: Get Build Cause](https://www.jenkins.io/doc/pipeline/examples/#get-build-cause)
