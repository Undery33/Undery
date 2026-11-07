# Jenkins feature 이미지 배포

현재 배포 정의는 `Jenkinsfile`의 BuildKit·GHCR 파이프라인입니다. 전체 설치·검증·운영 절차는 [컨테이너 배포 문서](container-deployment.md)를 따릅니다.

| 설정 | 값 |
| --- | --- |
| Job | `Undery_Feature` |
| Pipeline SCM | `https://github.com/Undery33/Undery.git` |
| SCM Branch Specifier | `refs/heads/feature/site-foundation` |
| Script Path | `Jenkinsfile` |
| Lightweight checkout | 사용 안 함 |
| FEATURE_BRANCH 기본값 | `feature/vrchat-web-gui` |
| DEPLOY 기본값 | `false` |
| 빌드 노드 | `site-ci`의 rootless Docker · BuildKit |
| 배포 노드 | `site-deploy` · 고정 root helper |
| GHCR push Credential ID | `ghcr-undery-push` |

`feature/site-foundation`의 Next.js 메인 앱·배포 설정과 `FEATURE_BRANCH`의 GUI를 각각 checkout하며 main merge는 수행하지 않습니다. `/`는 기존 메인 화면을 유지하고 `/vrchat`에 `dist/` 정적 GUI를 연결합니다. BuildKit으로 두 결과를 포함한 Node.js·Nginx 이미지를 만듭니다. 운영 이미지 태그에는 두 commit SHA가 들어가며 실제 배포는 digest를 사용합니다. `DEPLOY=false`는 게시·배포 없이 이미지 빌드와 검사만 수행합니다.

Nginx 전용 배포 helper를 사용 중이면 [컨테이너 배포 문서](container-deployment.md)의 설치 스크립트로 먼저 갱신해야 합니다. 새 helper는 고정 Node.js supervisor를 실행하며 Next.js와 Nginx가 함께 정상이어야 배포를 완료합니다.

`pollSCM('H/2 * * * *')`는 두 checkout의 변경을 감시합니다. Job·배포 설정의 `.git` URL은 유지하며 웹 소스만 동일 저장소의 `.git` 없는 URL과 `ScmName=undery-web-source`로 분리합니다. 이는 동일 remote URL의 `BuildData`가 서로 다른 브랜치를 혼동해 변경 없이 반복 빌드하는 현상을 방지하기 위한 구성입니다. polling으로 시작한 기본 실행은 검사만 수행합니다.

[Job XML](../deploy/jenkins-job.xml)은 설정 예시이며 파일 수정만으로 실행 중인 Jenkins Job이 변경되지는 않습니다. 기존 동적 `${FEATURE_BRANCH}` SCM 설정은 고정된 `feature/site-foundation`으로 변경해야 합니다.

기존 호스트 직접 실행 방식과 이전 운영 기록은 [이전 배포 문서](legacy-standalone-deployment.md)에 보존했습니다. 현재 Next.js standalone은 컨테이너 내부에서 실행합니다. 이전 호스트 배포 Job은 동시에 실행하지 않습니다.
