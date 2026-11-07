# BuildKit · GHCR · Jenkins 배포

## 브랜치와 실행 위치

| 대상 | 위치 | 역할 |
| --- | --- | --- |
| Dockerfile · Nginx · Jenkinsfile · 배포 스크립트 | `feature/site-foundation` | 배포 설정의 단일 기준 |
| HTML · CSS · JavaScript · 이미지 | `FEATURE_BRANCH`의 `dist/` | 기본 `feature/vrchat-web-gui` |
| BuildKit | Jenkins `site-ci`의 rootless Docker | 이미지를 한 번 빌드하고 실제 컨테이너 검사 |
| 이미지 저장소 | `ghcr.io/undery33/undery` | 검사한 이미지 게시 |
| 운영 실행 | `site-deploy`가 호출하는 고정 root helper | GHCR digest를 pull해 Nginx 컨테이너 실행 |
| GitHub Actions | 별도 검증 러너 | Dockerfile·Nginx·배포 코드 검사 전용. 이미지 게시·운영 배포 안 함 |

Jenkins Job의 **Pipeline from SCM Branch Specifier**는 `refs/heads/feature/site-foundation`으로 고정합니다. 웹 소스 브랜치를 Job SCM에 넣지 않습니다. Jenkinsfile은 두 저장소 작업 디렉터리를 만들고 각 checkout SHA를 기록합니다. 웹 소스의 Jenkinsfile·npm 스크립트·Dockerfile은 실행하지 않습니다.

main을 checkout·merge·push하는 단계가 없습니다. PR #1도 초안·미병합으로 유지합니다. `feature/` 접두어만 있다고 모든 형식을 배포할 수 있는 것은 아닙니다. 이 파이프라인은 유효한 `dist/index.html`과 로컬 정적 리소스를 가진 브랜치를 처리합니다. 기존 Next.js `feature/site-foundation` 자체는 이 정적 GUI 파이프라인의 웹 소스 대상이 아닙니다.

## 한 번 준비할 호스트 설정

서버 관리자가 저장소의 다음 스크립트를 검토한 뒤 실행합니다.

```sh
sudo sh deploy/install-rootless-builder.sh
sudo sh deploy/install-container-helper.sh
```

첫 스크립트는 **site-ci 전용 rootless Docker**를 설정합니다. 필요한 Docker rootless 도구·uidmap·slirp4netns와 subordinate UID/GID가 없으면 설치를 중단합니다. 호스트의 기존 Docker를 끄거나 Jenkins를 docker 그룹에 넣지 않습니다.

두 번째 스크립트는 고정 배포 helper와 site-deploy 전용 sudo 규칙을 설치합니다. 설치 자체로 운영 서비스를 중단하거나 배포하지 않습니다.

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

## Jenkins 실행

기존 `Undery_Feature`의 SCM을 위 고정 브랜치로 변경합니다. 전체 Job 예시는 `deploy/jenkins-job.xml`에 있습니다. 저장소 URL은 `https://github.com/Undery33/Undery.git`, Script Path는 `Jenkinsfile`, Lightweight checkout은 끕니다.

```text
FEATURE_BRANCH=feature/vrchat-web-gui
DEPLOY=false  # 빌드와 검사만
DEPLOY=true   # 같은 검사 후 GHCR 게시와 운영 반영
```

`DEPLOY=false`는 기본값입니다. SCM polling도 자동 운영 전환을 의미하지 않습니다. 새 feature 브랜치를 배포하려면 해당 파라미터를 명시해 실행합니다. 운영 사이트 한 곳을 선택한 브랜치로 교체하는 방식이며 브랜치별 preview URL을 만드는 방식이 아닙니다.

## 이미지 생성과 전환

1. 소스 SHA와 배포 설정 SHA를 각각 고정합니다.
2. `prepare-container-context.py`가 `dist/`와 검증된 배포 설정만 이미지 컨텍스트로 복사합니다. `.env`·자격 증명·심볼릭 링크·외부 경로는 제외가 아니라 오류로 처리합니다.
3. `docker buildx build --load`로 BuildKit 빌드를 수행합니다. 베이스는 공식 Nginx Alpine 이미지입니다. 최종 이미지에서 Nginx는 UID/GID `101:101`, 내부 포트 `8080`으로 실행합니다.
4. 동일 이미지에 read-only filesystem·cap-drop·no-new-privileges를 적용해 GUI·CSS·JS·전체 PNG·health·404·HTTP 메서드를 검사합니다.
5. 검사한 이미지 ID를 확인한 뒤 GHCR에 게시합니다. 태그는 소스 SHA와 배포 설정 SHA를 모두 포함합니다.
6. GHCR의 `sha256` digest를 기록하고 **digest로만** 운영 helper에 전달합니다. 운영 서버에서는 이미지를 다시 빌드하거나 소스를 합치지 않습니다.
7. helper가 source·revision·branch·pipeline revision 라벨을 확인하고 별도 loopback 포트에서 후보를 먼저 실행합니다.
8. 후보가 정상이면 기존 서비스를 멈추고 `127.0.0.1:3000`을 Nginx 컨테이너에 연결합니다. 기존 호스트 Nginx의 HTTPS proxy와 인증서는 계속 사용합니다.
9. loopback·운영 HTTPS의 커밋 식별 검사 실패 시 이전 컨테이너 또는 기존 systemd 서비스를 복구합니다.

컨테이너에 호스트 디렉터리나 Docker socket을 마운트하지 않습니다. 기존 Next 릴리스 파일은 삭제하지 않습니다. GUI 이미지에는 원본 정적 사이트만 포함하므로 기존 Computer·portfolio·관리자 페이지는 컨테이너 전환 후 제공되지 않습니다. 해당 기능을 유지하려면 GUI 브랜치에 별도 통합 작업이 필요합니다.

`/api/health` 응답은 웹 소스의 `commit`·`branch`와 배포 설정의 `pipelineCommit`을 구분합니다. 이미지 digest와 같은 값이 아니며 이미지 digest는 Jenkins `release.json`에서 확인합니다.

## 검증 한계

CI의 이미지 검사 성공은 실제 서버 전환 완료를 뜻하지 않습니다. Jenkins 로그인·GHCR Credentials·rootless builder·새 helper 준비 후 `DEPLOY=true` 실행과 운영 상태 확인이 모두 성공해야 배포 완료입니다. 강제 장애나 서버 재부팅을 실제로 발생시키는 시험은 별도입니다.

## 출처

- [Docker BuildKit](https://docs.docker.com/build/buildkit/)
- [Docker rootless mode](https://docs.docker.com/engine/security/rootless/)
- [Buildx container driver](https://docs.docker.com/build/builders/drivers/docker-container/)
- [GitHub Container registry 인증과 권한](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
