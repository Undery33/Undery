---
title: "Kubernetes (K8s)"
description: "API 서버에 기록한 배포 요청이 노드의 kubelet을 통해 파드 실행으로 이어지는 과정을 살펴봅니다."
publishedAt: "2026-11-19"
category: "linux"
tags: ["Kubernetes", "K8s", "파드", "Linux"]
draft: false
---

## 원하는 상태에서 실행 상태로

**API 서버**는 클러스터에 대한 요청을 받아 검증하고, 클러스터 데이터를 **etcd**에 저장합니다. Deployment로 복제본 수를 지정하면 컨트롤러들이 그 수에 맞춰 파드가 만들어지도록 상태를 조정합니다.

**스케줄러**는 아직 노드가 없는 파드를 배치할 곳을 고릅니다. 선택된 노드의 **kubelet**은 컨테이너 런타임을 통해 파드에 지정된 컨테이너가 실행되도록 관리합니다. 같은 파드의 컨테이너들은 네트워크를 공유하므로 서로 `localhost`로 통신할 수 있습니다.

## 파드가 준비되지 않을 때

`kubectl get pods -n <네임스페이스>`로 실제 파드 이름을 찾고, `kubectl describe pod <파드> -n <네임스페이스>`의 Events를 확인합니다. `FailedScheduling`이면 자원 요청량이나 배치 조건에 맞는 노드가 있는지 봅니다. `ImagePullBackOff`이면 이벤트에 나온 이미지 이름·태그와 레지스트리 접근 권한을 확인합니다.

필요한 설정을 고친 뒤 같은 네임스페이스에서 파드의 READY 열을 확인합니다. 앱이 요청을 처리하는지는 실제 서비스 주소로 접속해 별도로 검증합니다.

[Kubernetes 클러스터 구성 요소](https://kubernetes.io/docs/concepts/overview/components/) · [파드 문제 진단](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/)
