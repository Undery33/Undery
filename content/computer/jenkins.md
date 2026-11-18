---
title: "Jenkins"
description: "작업이 컨트롤러의 대기열에서 에이전트로 배정되고 워크스페이스에서 실행되는 과정을 설명합니다."
publishedAt: "2026-11-19"
category: "linux"
tags: ["Jenkins", "CI", "Linux"]
draft: false
---

## 작업이 실행될 곳을 정하는 과정

**컨트롤러**는 빌드 요청을 받아 대기열을 관리합니다. 파이프라인이 특정 라벨의 에이전트를 요구하면, 그 라벨에 맞는 노드에서 실행 슬롯인 **executor**가 비어야 해당 작업이 시작됩니다.

**워크스페이스**는 배정된 노드에서 작업에 사용하는 디렉터리입니다. Git 저장소를 체크아웃한 파이프라인이라면 이곳에서 소스를 읽고 빌드나 테스트를 실행합니다. 다음 단계가 다른 에이전트에서 실행될 경우, 필요한 파일을 `stash`와 `unstash` 등으로 전달할 수 있습니다.

## 대기 중인 빌드와 실패한 빌드

콘솔에 `Still waiting to schedule task`가 표시되면 Jenkinsfile의 `agent` 조건을 확인합니다. 노드 목록에서 해당 라벨의 에이전트가 온라인인지, executor가 다른 작업을 실행하고 있는지 확인한 뒤 라벨이나 연결 상태를 바로잡습니다.

이미 에이전트에서 시작한 빌드가 파일을 찾지 못한다면 콘솔의 체크아웃 기록과 워크스페이스 경로를 확인합니다. Linux 에이전트에서는 같은 작업 단계에서 `pwd`와 `ls`로 실제 위치와 파일을 확인할 수 있습니다. 다시 실행해 해당 에이전트에서 빌드와 테스트가 끝나는지 봅니다.

[Jenkins 노드와 executor](https://www.jenkins.io/doc/book/managing/nodes/) · [Jenkinsfile에서 에이전트와 파일 사용](https://www.jenkins.io/doc/book/pipeline/jenkinsfile/)
