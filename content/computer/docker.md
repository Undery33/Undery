---
title: "Docker"
description: "CLI에서 보낸 실행 요청이 Docker Engine을 거쳐 이미지와 컨테이너로 이어지는 과정을 살펴봅니다."
publishedAt: "2026-11-19"
category: "linux"
tags: ["Docker", "컨테이너", "Linux"]
draft: false
---

## 명령에서 컨테이너까지

`docker run`을 입력하면 **CLI**가 Docker Engine의 데몬에 API 요청을 보냅니다. 데몬은 요청한 이미지를 확인하고, 필요한 경우 레지스트리에서 내려받습니다. 그 이미지로 새 컨테이너를 만든 다음 지정된 프로세스를 시작합니다.

**이미지**는 파일과 실행 설정을 담은 읽기 전용 틀입니다. 같은 이미지에서 여러 컨테이너를 만들어도 각 컨테이너에는 별도의 쓰기 가능한 계층이 생깁니다. `docker image ls`로 로컬 이미지를, `docker ps -a`로 실행 중이거나 종료된 컨테이너를 확인할 수 있습니다.

## 컨테이너가 보이지 않을 때

데몬에 연결할 수 없다는 오류가 나면 `docker context show`와 `docker context inspect`로 CLI가 바라보는 엔드포인트를 확인합니다. 대상이 다르면 올바른 컨텍스트를 선택하고, 대상이 맞으면 해당 호스트의 데몬 실행 상태와 접근 권한을 확인합니다. 연결을 복구한 뒤 `docker info`의 서버 정보가 예상한 호스트와 일치하는지 봅니다.

연결은 되는데 `docker ps`에 앱이 없다면 `docker ps -a`에서 종료 상태와 실제 컨테이너 이름을 찾습니다. 그 이름으로 `docker logs <컨테이너>`를 열면 앱이 시작 직후에 멈춘 이유를 좁힐 수 있습니다.

[Docker 구조](https://docs.docker.com/get-started/docker-overview/) · [Docker 데몬 연결 문제 해결](https://docs.docker.com/engine/daemon/troubleshoot/)
