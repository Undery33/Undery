// Pipeline from SCM: Undery33/Undery, Branch Specifier refs/heads/${FEATURE_BRANCH}.
// This repository is owner-controlled. Do not configure PR/fork discovery here.
pipeline {
  agent none
  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timeout(time: 40, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }
  parameters {
    string(name: 'FEATURE_BRANCH', defaultValue: 'feature/site-foundation', description: '빌드할 feature/ 브랜치. main은 허용하지 않습니다.', trim: true)
    booleanParam(name: 'DEPLOY', defaultValue: false, description: '검증 성공 시 해당 feature 커밋을 웹사이트에 배포합니다.')
  }
  triggers { pollSCM('H/2 * * * *') }
  environment {
    NEXT_TELEMETRY_DISABLED = '1'
    SITE_URL = 'https://undery.link'
    NODE_OPTIONS = '--max-old-space-size=1536'
  }
  stages {
    stage('Build selected feature') {
      agent { label 'site-ci' }
      stages {
        stage('Validate branch and checkout') {
          steps {
            script {
              if (!(params.FEATURE_BRANCH ==~ /feature\/[A-Za-z0-9][A-Za-z0-9._\/-]*/) || params.FEATURE_BRANCH.contains('..') || env.CHANGE_ID) {
                error('소유 저장소의 feature/ 브랜치만 빌드할 수 있습니다.')
              }
              deleteDir()
              def revision = checkout scm
              def checkedBranch = revision.GIT_BRANCH.replaceFirst(/^origin\//, '')
              if (checkedBranch != params.FEATURE_BRANCH || revision.GIT_URL != 'https://github.com/Undery33/Undery.git') {
                error('Job SCM 저장소 또는 브랜치가 선택한 feature와 다릅니다.')
              }
              env.BUILD_COMMIT = revision.GIT_COMMIT
              env.SOURCE_BRANCH = params.FEATURE_BRANCH
              currentBuild.description = env.SOURCE_BRANCH + ' @ ' + env.BUILD_COMMIT.take(12)
            }
            sh '''#!/bin/sh
set -eu
test "$(git rev-parse HEAD)" = "$BUILD_COMMIT"
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'
python3 --version
'''
          }
        }
        stage('Install') { steps { sh 'npm ci --no-fund' } }
        stage('Validate') { steps { sh 'npm run check && npm run test:deploy' } }
        stage('Build') { steps { sh 'npm run build' } }
        stage('Verify standalone HTTP') { steps { sh 'npm run test:integration' } }
        stage('Archive verified release') {
          steps {
            sh 'npm run release:package && npm run test:release'
            archiveArtifacts artifacts: 'artifacts/*', fingerprint: true
            stash name: 'verified-release', includes: 'artifacts/*,scripts/smoke-test.mjs'
          }
        }
      }
    }
    stage('Deploy feature release') {
      when { beforeAgent true; expression { params.DEPLOY } }
      agent { label 'site-deploy' }
      steps {
        deleteDir()
        unstash 'verified-release'
        // Run a root-owned, separately installed helper. Never sudo repository code.
        sh '''#!/bin/sh
set -eu
cd artifacts
sha256sum -c release.tar.gz.sha256
sudo -n /usr/local/sbin/undery-deploy-release "$BUILD_COMMIT" "$SOURCE_BRANCH" < release.tar.gz
cd ..
SMOKE_BASE_URL="$SITE_URL" node scripts/smoke-test.mjs
'''
      }
    }
  }
}
