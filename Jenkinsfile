// The release checkout uses only the main ref. App, GUI and pipeline share its SHA.
pipeline {
  agent { label 'site-ci' }
  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timeout(time: 40, unit: 'MINUTES')
    buildDiscarder(logRotator(daysToKeepStr: '7', artifactNumToKeepStr: '20'))
  }
  parameters {
    booleanParam(name: 'DEPLOY', defaultValue: false, description: '수동 실행에서 검증한 main 이미지를 운영에 배포합니다.')
  }
  triggers { pollSCM('H/2 * * * *') }
  environment {
    SOURCE_BRANCH = 'main'
  }
  stages {
    stage('Checkout main') {
      steps {
        script {
          dir('source') {
            def result = checkout([$class: 'GitSCM',
              branches: [[name: 'refs/heads/main']],
              userRemoteConfigs: [[url: 'https://github.com/Undery33/Undery',
                refspec: '+refs/heads/main:refs/remotes/origin/main']],
              extensions: [[$class: 'CleanBeforeCheckout'], [$class: 'CloneOption',
                shallow: true, depth: 1, noTags: true, honorRefspec: true]]])
            env.BUILD_COMMIT = result.GIT_COMMIT
            sh 'test "$(git rev-parse HEAD)" = "$BUILD_COMMIT" && test "$(git rev-parse refs/remotes/origin/main)" = "$BUILD_COMMIT"'
          }
          env.PIPELINE_COMMIT = env.BUILD_COMMIT
          def causes = currentBuild.getBuildCauses()
          def automated = !causes.isEmpty() && causes.every {
            it._class in ['hudson.triggers.SCMTrigger$SCMTriggerCause', 'hudson.triggers.TimerTrigger$TimerTriggerCause']
          }
          env.SHOULD_DEPLOY = (!env.CHANGE_ID && (automated || params.DEPLOY)) ? 'true' : 'false'
          currentBuild.description = 'main @ ' + env.BUILD_COMMIT.take(12)
        }
      }
    }
    stage('Validate and build main image') {
      steps {
        dir('release') { deleteDir() }
        dir('source') {
          sh '''#!/bin/sh
set -eu
python3 -m unittest discover -s tests/container -v
python3 -m unittest discover -s tests/deploy -v
python3 scripts/prepare-container-context.py --source . --output ../release/context \
  --commit "$BUILD_COMMIT" --branch main --pipeline-commit "$BUILD_COMMIT"
sh scripts/build-container.sh ../release/context ../release/artifacts
sha256sum deploy/undery-deploy-container.py | cut -d ' ' -f 1 > ../release/artifacts/deploy-helper-sha256.txt
'''
        }
      }
    }
    stage('Publish tested image to GHCR') {
      when { expression { env.SHOULD_DEPLOY == 'true' } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'ghcr-undery-push', usernameVariable: 'GHCR_USERNAME', passwordVariable: 'GHCR_PASSWORD')]) {
          sh 'sh source/scripts/push-container.sh release/artifacts'
        }
        archiveArtifacts artifacts: 'release/artifacts/*', fingerprint: true
        stash name: 'container-release', includes: 'release/artifacts/*'
      }
    }
    stage('Deploy main image') {
      when { beforeAgent true; expression { env.SHOULD_DEPLOY == 'true' } }
      agent { label 'site-deploy' }
      steps {
        deleteDir()
        unstash 'container-release'
        script {
          int status = sh(returnStatus: true, script: '''#!/bin/sh
set -eu
remote=$(git ls-remote --exit-code https://github.com/Undery33/Undery.git refs/heads/main)
if [ "${remote%%[[:space:]]*}" != "$BUILD_COMMIT" ]; then exit 3; fi
artifacts=release/artifacts
if [ "$(sha256sum /usr/local/sbin/undery-deploy-container | cut -d ' ' -f 1)" != "$(cat "$artifacts/deploy-helper-sha256.txt")" ]; then
  echo '운영 서버에서 main의 deploy/install-container-helper.sh를 설치한 뒤 다시 배포하십시오.' >&2
  exit 1
fi
sudo -n /usr/local/sbin/undery-deploy-container "$BUILD_COMMIT" main "$BUILD_COMMIT" "$(cat "$artifacts/image-digest.txt")" || exit 1
''')
          if (status == 3) {
            currentBuild.description += ' / 더 최신 main 커밋으로 대체'
          } else if (status != 0) {
            error('main 배포에 실패했습니다. site-deploy 콘솔을 확인하십시오.')
          } else {
            currentBuild.description += ' / 운영 배포'
          }
        }
      }
    }
  }
}
