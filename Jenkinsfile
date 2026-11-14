// Job SCM is fixed to refs/heads/feature/site-foundation.
// FEATURE_BRANCH selects web content only; its scripts are never executed.
pipeline {
  agent none
  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timeout(time: 40, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }
  parameters {
    string(name: 'FEATURE_BRANCH', defaultValue: 'feature/vrchat-web-gui', description: 'dist/ 정적 사이트가 있는 feature/ 브랜치', trim: true)
    booleanParam(name: 'DEPLOY', defaultValue: false, description: '수동 실행에서 게시·배포합니다. VRChat 브랜치 변경은 SCM 자동 실행에서 배포합니다.')
  }
  triggers { pollSCM('H/2 * * * *') }
  stages {
    stage('Build selected feature image') {
      agent { label 'site-ci' }
      stages {
        stage('Checkout infrastructure and web source') {
          steps {
            script {
              if (!(params.FEATURE_BRANCH ==~ /feature\/[A-Za-z0-9][A-Za-z0-9._\/-]*/) || params.FEATURE_BRANCH.contains('..') || env.CHANGE_ID) {
                error('소유 저장소의 feature/ 브랜치만 배포할 수 있습니다.')
              }
              deleteDir()
              dir('infrastructure') {
                def infra = checkout scm
                if (infra.GIT_BRANCH.replaceFirst(/^origin\//, '') != 'feature/site-foundation' || infra.GIT_URL != 'https://github.com/Undery33/Undery.git') {
                  error('Job SCM은 Undery33/Undery의 feature/site-foundation이어야 합니다.')
                }
                env.PIPELINE_COMMIT = infra.GIT_COMMIT
              }
              dir('web-source') {
                // GitSCM BuildData matches the remote URL, not its branch or ScmName.
                // Keep this equivalent URL distinct from the Job/infra .git URL.
                // Always poll the VRChat branch, even after a manual build of another feature.
                def source = checkout([$class: 'GitSCM',
                  branches: [[name: 'refs/heads/feature/vrchat-web-gui']],
                  userRemoteConfigs: [[url: 'https://github.com/Undery33/Undery']],
                  extensions: [[$class: 'ScmName', name: 'undery-web-source'],
                    [$class: 'CloneOption', shallow: true, depth: 1, noTags: true]]])
                if (source.GIT_BRANCH.replaceFirst(/^origin\//, '') != 'feature/vrchat-web-gui' || source.GIT_URL != 'https://github.com/Undery33/Undery') {
                  error('자동 감시 대상 VRChat 브랜치와 checkout 결과가 다릅니다.')
                }
                env.BUILD_COMMIT = source.GIT_COMMIT
                env.PREVIOUS_GUI_COMMIT = source.GIT_PREVIOUS_SUCCESSFUL_COMMIT ?: ''
                env.SOURCE_BRANCH = params.FEATURE_BRANCH
                if (params.FEATURE_BRANCH != 'feature/vrchat-web-gui') {
                  // Do not register another GitSCM: manual branches must not replace polling history.
                  withEnv(['REQUESTED_BRANCH=' + params.FEATURE_BRANCH]) {
                    sh '''#!/bin/sh
set -eu
git fetch --no-tags --depth=1 origin "refs/heads/$REQUESTED_BRANCH"
git checkout --detach FETCH_HEAD
'''
                  }
                  env.BUILD_COMMIT = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
                }
              }
              def causes = currentBuild.getBuildCauses()
              // A mixed manual/SCM queue item keeps the explicit manual DEPLOY choice.
              env.SCM_TRIGGERED = (!causes.isEmpty() && causes.every { it._class == 'hudson.triggers.SCMTrigger$SCMTriggerCause' }) ? 'true' : 'false'
              env.MANUAL_DEPLOY = params.DEPLOY ? 'true' : 'false'
              env.DEPLOY_MODE = sh(script: '''#!/bin/sh
set -eu
python3 infrastructure/deploy/deployment-policy.py --branch "$SOURCE_BRANCH" --commit "$BUILD_COMMIT" --previous "$PREVIOUS_GUI_COMMIT" --manual "$MANUAL_DEPLOY" --scm "$SCM_TRIGGERED"
''', returnStdout: true).trim()
              env.SHOULD_DEPLOY = (env.DEPLOY_MODE in ['auto', 'manual']) ? 'true' : 'false'
              echo '배포 모드: ' + env.DEPLOY_MODE + ' / 이전 성공 GUI: ' + (env.PREVIOUS_GUI_COMMIT ?: '없음')
              currentBuild.description = env.SOURCE_BRANCH + ' @ ' + env.BUILD_COMMIT.take(12) + ' / infra ' + env.PIPELINE_COMMIT.take(12) + ' / ' + env.DEPLOY_MODE
            }
            sh '''#!/bin/sh
set -eu
test "$(git -C web-source rev-parse HEAD)" = "$BUILD_COMMIT"
test "$(git -C infrastructure rev-parse HEAD)" = "$PIPELINE_COMMIT"
python3 infrastructure/scripts/prepare-container-context.py --source web-source --output container-context --commit "$BUILD_COMMIT" --branch "$SOURCE_BRANCH" --pipeline-commit "$PIPELINE_COMMIT"
'''
          }
        }
        stage('Validate deployment tooling') {
          steps {
            dir('infrastructure') {
              sh 'python3 -m unittest discover -s tests/container -v && python3 -m unittest discover -s tests/deploy -v'
            }
          }
        }
        stage('BuildKit build and container HTTP checks') {
          steps {
            sh '''#!/bin/sh
set -eu
sh infrastructure/scripts/build-container.sh container-context artifacts
sha256sum infrastructure/deploy/undery-deploy-container.py | cut -d ' ' -f 1 > artifacts/deploy-helper-sha256.txt
'''
          }
        }
        stage('Publish tested image to GHCR') {
          when { expression { env.SHOULD_DEPLOY == 'true' } }
          steps {
            withCredentials([usernamePassword(credentialsId: 'ghcr-undery-push', usernameVariable: 'GHCR_USERNAME', passwordVariable: 'GHCR_PASSWORD')]) {
              sh 'sh infrastructure/scripts/push-container.sh artifacts'
            }
            archiveArtifacts artifacts: 'artifacts/*', fingerprint: true
            stash name: 'container-release', includes: 'artifacts/*'
          }
        }
      }
    }
    stage('Deploy immutable image') {
      when { beforeAgent true; expression { env.SHOULD_DEPLOY == 'true' } }
      agent { label 'site-deploy' }
      steps {
        deleteDir()
        unstash 'container-release'
        sh '''#!/bin/sh
set -eu
image=$(cat artifacts/image-digest.txt)
expected_helper=$(cat artifacts/deploy-helper-sha256.txt)
actual_helper=$(sha256sum /usr/local/sbin/undery-deploy-container | cut -d ' ' -f 1)
if [ "$actual_helper" != "$expected_helper" ]; then
  echo '운영 helper가 현재 배포 설정과 다릅니다. 관리자가 deploy/install-container-helper.sh를 설치한 뒤 다시 실행해야 합니다.' >&2
  exit 1
fi
sudo -n /usr/local/sbin/undery-deploy-container "$BUILD_COMMIT" "$SOURCE_BRANCH" "$PIPELINE_COMMIT" "$image"
'''
      }
    }
  }
}
