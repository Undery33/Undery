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
    booleanParam(name: 'DEPLOY', defaultValue: false, description: '검사한 이미지를 GHCR에 게시하고 운영 서버에 배포합니다.')
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
                def source = checkout([$class: 'GitSCM',
                  branches: [[name: 'refs/heads/' + params.FEATURE_BRANCH]],
                  userRemoteConfigs: [[url: 'https://github.com/Undery33/Undery.git']],
                  extensions: [[$class: 'CloneOption', shallow: true, depth: 1, noTags: true]]])
                if (source.GIT_BRANCH.replaceFirst(/^origin\//, '') != params.FEATURE_BRANCH) {
                  error('선택한 웹 소스 브랜치와 checkout 결과가 다릅니다.')
                }
                env.BUILD_COMMIT = source.GIT_COMMIT
                env.SOURCE_BRANCH = params.FEATURE_BRANCH
              }
              currentBuild.description = env.SOURCE_BRANCH + ' @ ' + env.BUILD_COMMIT.take(12) + ' / infra ' + env.PIPELINE_COMMIT.take(12)
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
          steps { sh 'sh infrastructure/scripts/build-container.sh container-context artifacts' }
        }
        stage('Publish tested image to GHCR') {
          when { expression { params.DEPLOY } }
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
      when { beforeAgent true; expression { params.DEPLOY } }
      agent { label 'site-deploy' }
      steps {
        deleteDir()
        unstash 'container-release'
        sh '''#!/bin/sh
set -eu
image=$(cat artifacts/image-digest.txt)
sudo -n /usr/local/sbin/undery-deploy-container "$BUILD_COMMIT" "$SOURCE_BRANCH" "$PIPELINE_COMMIT" "$image"
'''
      }
    }
  }
}
