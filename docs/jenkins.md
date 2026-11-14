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
| 자동 배포 | `feature/vrchat-web-gui`의 새 커밋을 SCM polling으로 감지하면 실행 |
| 빌드 노드 | `site-ci`의 rootless Docker · BuildKit |
| 배포 노드 | `site-deploy` · 고정 root helper |
| GHCR push Credential ID | `ghcr-undery-push` |

`feature/site-foundation`의 Next.js 메인 앱·배포 설정과 `FEATURE_BRANCH`의 GUI를 각각 checkout하며 main merge는 수행하지 않습니다. `/`는 기존 메인 화면을 유지하고 `/vrchat`에 `dist/` 정적 GUI를 연결합니다. BuildKit으로 두 결과를 포함한 Node.js·Nginx 이미지를 만듭니다. 운영 이미지 태그에는 두 commit SHA가 들어가며 실제 배포는 digest를 사용합니다. **수동 실행**의 `DEPLOY=false`는 게시·배포 없이 검사만 수행합니다.

Nginx 전용 배포 helper를 사용 중이면 [컨테이너 배포 문서](container-deployment.md)의 설치 스크립트로 먼저 갱신해야 합니다. 새 helper는 고정 Node.js supervisor를 실행하며 Next.js와 Nginx가 함께 정상이어야 배포를 완료합니다.

`pollSCM('H/2 * * * *')`는 약 2분마다 배포 설정과 `feature/vrchat-web-gui`를 감시합니다. SCM 자동 실행에서 GUI SHA가 직전 성공 빌드의 GUI SHA와 다르면 `DEPLOY` 기본값이 `false`여도 **검증 → GHCR 게시 → digest 배포**를 진행합니다. 배포 설정만 바뀌었으면 검사만 수행합니다. 첫 빌드처럼 비교할 GUI 이력이 없을 때도 검사만 수행하며 최초 배포는 `DEPLOY=true`로 실행합니다.

수동 실행은 `DEPLOY` 값을 따릅니다. 수동·SCM 원인이 함께 기록된 실행도 수동 선택을 우선합니다. 다른 `feature/` 브랜치의 수동 배포는 유지하면서 자동 감시 대상은 VRChat으로 고정합니다. 수동 대상이 다른 경우 고정 GUI checkout 뒤 해당 ref를 Git으로 fetch하므로 Jenkins의 polling 기준을 다른 브랜치로 교체하지 않습니다.

Job·배포 설정의 `.git` URL은 유지하며 GUI 감시는 동일 저장소의 `.git` 없는 URL과 `ScmName=undery-web-source`로 분리합니다. 이는 동일 remote URL의 `BuildData`가 서로 다른 브랜치를 혼동해 변경 없이 반복 빌드하는 현상을 방지하기 위한 구성입니다. 로그의 `배포 모드`와 빌드 설명에서 `auto`·`manual`·`check`를 확인할 수 있습니다. 검사 실패 시 새 이미지는 게시·배포하지 않으며 운영 전환 실패 시 기존 rollback 절차를 따릅니다.

[Job XML](../deploy/jenkins-job.xml)은 설정 예시이며 파일 수정만으로 실행 중인 Jenkins Job이 변경되지는 않습니다. 기존 동적 `${FEATURE_BRANCH}` SCM 설정은 고정된 `feature/site-foundation`으로 변경해야 합니다.

기존 호스트 직접 실행 방식과 이전 운영 기록은 [이전 배포 문서](legacy-standalone-deployment.md)에 보존했습니다. 현재 Next.js standalone은 컨테이너 내부에서 실행합니다. 이전 호스트 배포 Job은 동시에 실행하지 않습니다.
