// Undery_Feature always loads this pipeline from feature/site-foundation.
pipeline {
  agent { label 'site-ci' }
  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timeout(time: 40, unit: 'MINUTES')
    buildDiscarder(logRotator(daysToKeepStr: '7', artifactNumToKeepStr: '20'))
  }
  parameters {
    string(name: 'FEATURE_BRANCH', defaultValue: 'feature/vrchat-web-gui', description: '수동으로 검사하거나 배포할 feature/ 브랜치', trim: true)
    booleanParam(name: 'DEPLOY', defaultValue: false, description: '수동 실행에서도 검사한 이미지를 운영에 반영합니다.')
  }
  triggers { cron('H/2 * * * *') }
  stages {
    stage('Select feature revision') {
      steps {
        script {
          dir('infrastructure') {
            def infra = checkout scm
            if (infra.GIT_BRANCH.replaceFirst(/^origin\//, '') != 'feature/site-foundation' ||
                infra.GIT_URL != 'https://github.com/Undery33/Undery.git' || env.CHANGE_ID) {
              error('Undery33/Undery의 feature/site-foundation Job SCM이 필요합니다.')
            }
            env.PIPELINE_COMMIT = infra.GIT_COMMIT
          }
          def causes = currentBuild.getBuildCauses()
          env.AUTO_BUILD = (!causes.isEmpty() && causes.every {
            it._class in ['hudson.triggers.TimerTrigger$TimerTriggerCause', 'hudson.triggers.SCMTrigger$SCMTriggerCause']
          }) ? 'true' : 'false'
          env.RUN_RELEASE = 'false'
          env.SHOULD_DEPLOY = 'false'
          env.DEPLOYED = 'false'
          env.EXPECTED_COMMIT = ''
          if (env.AUTO_BUILD == 'true') {
            def target = sh(script: 'python3 infrastructure/deploy/deployment-policy.py select release-event.json', returnStdout: true).trim()
            if (!target) {
              currentBuild.description = '새 feature 변경 없음'
              return
            }
            def fields = target.tokenize(' ')
            env.SOURCE_BRANCH = fields[0]
            env.EXPECTED_COMMIT = fields[1]
          } else {
            env.SOURCE_BRANCH = params.FEATURE_BRANCH
          }
          if (!(env.SOURCE_BRANCH ==~ /feature\/[A-Za-z0-9][A-Za-z0-9._\/-]*/) || env.SOURCE_BRANCH.contains('..')) {
            error('지원되는 feature/ 브랜치 이름이 필요합니다.')
          }
          dir('release') {
            deleteDir()
            int status = sh(script: 'sh ../infrastructure/scripts/checkout-feature.sh', returnStatus: true)
            if (status == 3) {
              currentBuild.description = env.SOURCE_BRANCH + ' / 새 HEAD 대기'
            } else if (status != 0) {
              error('브랜치 소스 또는 컨테이너 빌드 입력을 확인할 수 없습니다.')
            } else {
              env.BUILD_COMMIT = readFile('artifacts/source-commit.txt').trim()
              env.APP_COMMIT = readFile('artifacts/app-commit.txt').trim()
              env.APP_BRANCH = readFile('artifacts/app-branch.txt').trim()
              env.RUN_RELEASE = 'true'
              currentBuild.description = env.SOURCE_BRANCH + ' @ ' + env.BUILD_COMMIT.take(12)
            }
          }
          env.SHOULD_DEPLOY = (env.RUN_RELEASE == 'true' && (env.AUTO_BUILD == 'true' || params.DEPLOY)) ? 'true' : 'false'
        }
      }
    }
    stage('Validate deployment tooling') {
      when { expression { env.RUN_RELEASE == 'true' } }
      steps {
        dir('infrastructure') {
          sh 'python3 -m unittest discover -s tests/container -v && python3 -m unittest discover -s tests/deploy -v'
        }
      }
    }
    stage('BuildKit build and container HTTP checks') {
      when { expression { env.RUN_RELEASE == 'true' } }
      steps {
        dir('release') {
          sh '''#!/bin/sh
set -eu
sh ../infrastructure/scripts/build-container.sh context artifacts
sha256sum ../infrastructure/deploy/undery-deploy-container.py | cut -d ' ' -f 1 > artifacts/deploy-helper-sha256.txt
'''
        }
      }
    }
    stage('Publish tested image to GHCR') {
      when { expression { env.SHOULD_DEPLOY == 'true' } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'ghcr-undery-push', usernameVariable: 'GHCR_USERNAME', passwordVariable: 'GHCR_PASSWORD')]) {
          sh 'sh infrastructure/scripts/push-container.sh release/artifacts'
        }
        archiveArtifacts artifacts: 'release/artifacts/*', fingerprint: true
        stash name: 'container-release', includes: 'release/artifacts/*,infrastructure/deploy/deployment-policy.py,release-event.json'
      }
    }
    stage('Deploy immutable image') {
      when { beforeAgent true; expression { env.SHOULD_DEPLOY == 'true' } }
      agent { label 'site-deploy' }
      steps {
        deleteDir()
        unstash 'container-release'
        script {
          int status = sh(returnStatus: true, script: '''#!/bin/sh
set -eu
if [ "$AUTO_BUILD" = true ]; then
  python3 infrastructure/deploy/deployment-policy.py current release-event.json
fi
remote=$(git ls-remote --heads https://github.com/Undery33/Undery.git "refs/heads/$SOURCE_BRANCH")
if [ "${remote%%[[:space:]]*}" != "$BUILD_COMMIT" ]; then exit 3; fi
artifacts=release/artifacts
test "$(sha256sum /usr/local/sbin/undery-deploy-container | cut -d ' ' -f 1)" = "$(cat "$artifacts/deploy-helper-sha256.txt")"
sudo -n /usr/local/sbin/undery-deploy-container "$BUILD_COMMIT" "$SOURCE_BRANCH" "$PIPELINE_COMMIT" "$(cat "$artifacts/image-digest.txt")" || exit 1
''')
          if (status == 3) {
            currentBuild.description += ' / 최신 변경으로 대체'
          } else if (status != 0) {
            error('최신 변경 확인 또는 운영 배포에 실패했습니다.')
          } else {
            env.DEPLOYED = 'true'
            currentBuild.description += ' / 운영 배포'
          }
        }
      }
    }
    stage('Record successful feature activity') {
      when { expression { env.AUTO_BUILD == 'true' && env.DEPLOYED == 'true' } }
      steps {
        sh 'python3 infrastructure/deploy/deployment-policy.py complete release-event.json'
      }
    }
  }
}
