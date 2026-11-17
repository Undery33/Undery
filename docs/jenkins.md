# Jenkins main 배포

`Undery_Feature`는 기존 작업 이름입니다. Jenkins는 `main`을 2분마다 폴링합니다. 새 커밋의 Next.js 앱과 `dist/`의 VRChat GUI를 단일 이미지로 빌드하고 검사합니다. 운영 전환 직전에 원격 `main`의 SHA를 다시 확인합니다.

## 기존 서버 전환

1. 서버에 체크아웃한 `main`에서 `sudo sh deploy/install-container-helper.sh`를 실행합니다. 이전 버전은 feature 브랜치만 허용합니다. 설치 스크립트가 현재 도우미와 sudo 설정을 백업합니다.
2. Jenkins의 **Undery_Feature → Configure → Pipeline → Pipeline script from SCM**에서 아래 설정을 저장합니다. 기존 자격 증명과 빌드 이력은 그대로 사용합니다.
3. **Build with Parameters**에서 `DEPLOY=true`로 한 번 실행합니다. 이후 SCM 변경으로 시작된 빌드는 자동 배포합니다. 수동 실행의 기본값 `DEPLOY=false`는 빌드와 검사만 수행합니다.
4. 배포 후 [운영 상태](https://undery.link/api/health)에서 `branch`가 `main`이고 `commit`과 `pipelineCommit`이 동일한 main SHA인지 확인합니다.

| Jenkins 설정 | 값 |
| --- | --- |
| Repository URL | `https://github.com/Undery33/Undery.git` |
| Refspec (Repositories → Advanced) | `+refs/heads/main:refs/remotes/origin/main` |
| Branch Specifier | `refs/heads/main` |
| Script Path | `Jenkinsfile` |
| Lightweight checkout | 사용 안 함 |
| 빌드 / 배포 에이전트 | `site-ci` / `site-deploy` |
| GHCR push Credential ID | `ghcr-undery-push` |

Jenkins 작업의 설정 예시는 [jenkins-job.xml](../deploy/jenkins-job.xml)에 있습니다. 호스트 설치, GHCR 자격 증명, 운영 검증과 롤백 절차는 [컨테이너 배포 문서](container-deployment.md)에 있습니다.
