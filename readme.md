# DDADDARO — Cake Lettering Robot Arm

> 사용자 문구·이미지를 **Computer Vision 기반 stroke path**로 변환하고 Doosan M0609 협동로봇으로 그리는 자동 케이크 레터링 시스템

## Overview

DDADDARO는 사용자가 웹 UI에서 입력한 문구와 이미지를 로봇이 따라 그릴 수 있는 경로로 변환해 실제 케이크 위에 자동으로 레터링하는 프로젝트입니다.

ROS 2 Humble을 중심으로 React 기반 UI, 영상 처리, 경로 생성, Doosan M0609 제어를 통합했습니다.

```text
Customer Input / Image
        ↓
React UI + Rosbridge
        ↓
ROS 2 Manager Node
        ↓
Image Pre-processing
        ↓
Skeleton / Stroke Path Extraction
        ↓
Pixel → Robot Coordinate Conversion
        ↓
Doosan M0609 MoveL Execution
        ↓
Progress / Error Monitoring
```

---

## Core Pipeline

### 1. Image Pre-processing

입력 이미지를 grayscale로 변환하고 thresholding, dilation, Gaussian blur 등의 전처리를 적용해 로봇이 따라갈 수 있는 선 구조를 추출했습니다.

### 2. Skeleton-based Path Extraction

이진 이미지에 skeletonization을 적용해 중심선을 만든 뒤, 8-neighbor 연결 관계를 그래프로 구성해 stroke path를 생성했습니다.

연결 성분과 endpoint를 기준으로 경로를 추출하고, 불필요한 점 이동을 줄이기 위해 진행 방향을 고려해 stroke 순서를 구성했습니다.

### 3. Pixel → Robot Coordinate Mapping

이미지 좌표를 실제 작업 영역의 mm 단위 좌표로 변환하고 중심 기준으로 정렬해 Doosan M0609의 작업 경로로 변환했습니다.

### 4. Robot Execution

생성한 경로를 MoveL / aMoveL 기반으로 실행해 연속적인 드로잉 동작을 구현했습니다.

### 5. Error Recovery

로봇 상태를 모니터링하고 작업이 중단될 경우 현재 stroke와 point 위치를 저장해, 복구 후 중단 지점부터 다시 작업할 수 있도록 구성했습니다.

---

## System Architecture

- **ROS 2 Humble** — 노드 간 통신 및 로봇 제어
- **React + Rosbridge** — 사용자 주문 및 관리자 UI
- **OpenCV / Skeletonization** — 이미지 전처리 및 중심선 추출
- **NetworkX** — stroke graph 구성 및 경로 추출
- **Doosan M0609** — 실제 드로잉 동작 수행
- **OnRobot RG2** — 도구 취급용 gripper

---

## My Contribution

- 이미지 → stroke path 변환 파이프라인 설계 및 구현
- Threshold / Skeletonization 기반 중심선 추출
- NetworkX 기반 stroke graph 및 경로 생성
- Pixel → Robot 좌표 변환
- Doosan M0609 MoveL 기반 드로잉 로직 구현
- 진행률/예상시간 처리 및 로봇 상태 모니터링
- 중단 stroke/point 저장 및 자동 재개 구조 구현
- UI–ROS 2–Robot 전체 시스템 통합 및 디버깅

---

## Tech Stack

`Ubuntu 22.04` `ROS 2 Humble` `Python` `OpenCV` `NetworkX` `React` `Rosbridge` `Doosan M0609` `OnRobot RG2`

---

## Project Structure

```text
ddaddaro/
├── main ROS 2 package
├── image / path processing
└── robot control logic

custom_monitor/
└── customer React UI

admin_monitor/
└── admin React UI
```

---

## What I Learned

이 프로젝트를 통해 이미지 처리 결과를 단순 시각화로 끝내지 않고 **실제 로봇의 물리 동작으로 변환하는 과정**을 경험했습니다.

특히 경로 생성 알고리즘의 품질뿐 아니라 좌표 변환, 로봇 상태, 통신 지연, 예외 복구까지 함께 고려해야 실제 자동화 시스템이 완성된다는 점을 배웠습니다.

---

## Team

ROKEY D-3  
곽준영 · 김태영 · 박경모 · 이강인