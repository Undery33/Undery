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

웹 소스와 배포 설정을 각각 checkout하며 main merge는 수행하지 않습니다. `feature/` 브랜치 중 `dist/` 정적 사이트 계약을 만족하는 브랜치를 선택할 수 있습니다. 운영 이미지 태그에는 두 commit SHA가 들어가며 실제 배포는 digest를 사용합니다. `DEPLOY=false`는 게시·배포 없이 이미지 빌드와 검사만 수행합니다.

[Job XML](../deploy/jenkins-job.xml)은 설정 예시이며 파일 수정만으로 실행 중인 Jenkins Job이 변경되지는 않습니다. 기존 동적 `${FEATURE_BRANCH}` SCM 설정은 고정된 `feature/site-foundation`으로 변경해야 합니다.

기존 Next.js standalone 배포 구조와 이전 운영 기록은 [이전 배포 문서](legacy-standalone-deployment.md)에 보존했습니다. 신규 컨테이너 전환 후 이전 배포 Job을 동시에 실행하지 않습니다.
