# Jenkins에서 feature 브랜치 검증·배포

## 작업 방식

`main` 병합 없이 `feature/site-foundation` 등 선택한 `feature/` 브랜치를 빌드합니다. 저장소는 `https://github.com/Undery33/Undery.git`입니다. 이전 `Introduce_Page` 저장소의 main 전용 Jenkinsfile을 사용하지 않습니다.

| 항목 | 설정 |
| --- | --- |
| Job 이름 | `Undery_Feature` |
| 유형 | Pipeline → Pipeline script from SCM → Git |
| Repository URL | `https://github.com/Undery33/Undery.git` |
| Branch Specifier | `refs/heads/${FEATURE_BRANCH}` |
| Script Path | `Jenkinsfile` |
| Lightweight checkout | 해제. 파라미터가 적용된 SCM을 전체 checkout합니다. |
| `FEATURE_BRANCH` 문자열 기본값 | `feature/site-foundation` |
| `DEPLOY` boolean 기본값 | `false`. 검사·빌드만 수행합니다. |
| 빌드 에이전트 | 기존 `site-ci` |
| 배포 에이전트 | 기존 `site-deploy` |
| 대상 주소 | `https://undery.link` |

초기 Job 파라미터와 SCM 설정은 [jenkins-job.xml](../deploy/jenkins-job.xml)과 같습니다. 파이프라인을 읽기 전에 파라미터가 필요하므로 첫 실행 전 두 파라미터를 Job 설정에 등록합니다. 소유자만 수정하는 원본 저장소를 대상으로 합니다. 외부 PR·fork용 Job으로 연결하지 않습니다.

## 파이프라인

1. `FEATURE_BRANCH`가 `feature/`인지 검사합니다. `main`과 PR 빌드는 거부합니다.
2. `checkout scm`으로 Jenkinsfile을 읽은 리비전을 사용합니다. 저장소 URL과 실제 브랜치를 검증하고 전체 커밋 SHA를 기록합니다.
3. `npm ci` → `npm run check` → `npm run test:deploy` → `npm run build`를 실행합니다.
4. 소스 디렉터리와 분리한 `.next/standalone`에서 임시 서버를 실행합니다. Markdown 검색·상세·CSS·관리자 503·포트폴리오 noindex·빌드 식별자를 검사합니다.
5. 해당 빌드의 산출물과 SHA-256을 보관하고 `stash`로 배포 에이전트에 전달합니다. 배포 단계는 소스를 다시 checkout하거나 빌드하지 않습니다.
6. `DEPLOY=true`일 때만 설치된 root 소유 도우미를 호출합니다. 커밋·브랜치·저장소와 압축 파일 경로를 검증한 뒤 릴리스 링크를 교체합니다.
7. `undery-web.service`를 재시작합니다. `/api/health`가 선택한 커밋·브랜치를 반환해야 성공입니다. 재시작 또는 상태 확인 실패 시 이전 링크로 되돌리고 서비스를 재시작합니다.

2분 SCM polling은 **Job에서 선택한 브랜치**의 변경을 확인합니다. 기본값은 검사 전용입니다. 운영 반영은 `Build with Parameters`에서 `DEPLOY`를 선택해 실행합니다. 한 Job의 동시 실행은 금지하며 호스트 배포 도우미도 파일 잠금으로 직렬화합니다.

## 배포 도우미 최초 설치

기존 서버의 `/opt/personal-site/web/current`, `releases`, `undery-web.service`를 사용합니다. `current`가 가리키는 기존 릴리스는 삭제하지 않습니다. DB·미디어·Nginx 설정과 서비스 환경 파일은 수정하지 않습니다.

호스트 관리자가 검토한 checkout에서 1회 실행합니다.

```sh
sudo sh deploy/install-helper.sh
```

설치되는 파일은 `/usr/local/sbin/undery-deploy-release`와 `/etc/sudoers.d/undery-feature-deploy`입니다. 기존 파일이 있으면 `/var/backups/undery-feature-deploy/` 아래 백업합니다. 새 sudo 규칙은 `site-deploy` 계정에 이 도우미만 허용합니다. Jenkins Controller 실행기·Docker socket·임의 shell sudo 권한은 추가하지 않습니다.

도우미는 저장소 안의 스크립트를 root로 실행하지 않습니다. root는 일반 파일만 추출하고 링크 교체·고정 서비스 재시작·HTTP 요청을 수행합니다. 웹 코드는 기존 systemd 서비스의 `DynamicUser`로 실행합니다. 아카이브의 `.env*`, 심볼릭 링크·하드링크, 경로 이탈, 중복 파일과 용량 초과를 거부합니다.

설치 후 `Undery_Feature` Job에서 `FEATURE_BRANCH=feature/site-foundation`, `DEPLOY=true`로 실행합니다. 성공 로그의 커밋과 `https://undery.link/api/health`의 커밋이 같아야 합니다. root가 소유하고 다른 사용자가 쓸 수 없는 릴리스 디렉터리와 기존 서비스가 필요하며 조건이 다르면 닫힌 상태로 실패합니다.

## 검증 범위

`npm run test:deploy`는 실제 서비스를 변경하지 않고 압축 검증·main 거부·커밋 불일치·파일 경로 공격·상태 확인 실패·재시작 실패·복구를 검사합니다. 실제 Jenkins 실행 및 호스트 설치·운영 반영은 각 실행 결과로 별도 확인해야 합니다. 이 문서의 존재가 설치·배포 성공을 뜻하지 않습니다.

## 출처

- [Jenkins Pipeline syntax](https://www.jenkins.io/doc/book/pipeline/syntax/)
- [Jenkins: Using a Jenkinsfile](https://www.jenkins.io/doc/book/pipeline/jenkinsfile/)
- [Jenkins Git plugin](https://www.jenkins.io/doc/pipeline/steps/git/)
- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
