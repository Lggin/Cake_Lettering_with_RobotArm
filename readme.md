# DDADDARO Project: M0609 Robot Arm Control
> **조 이름:** [D-3 - ROKEY]
> **팀원:** [곽준영_김태영_박경모_이강인]

## 1. 🎨 시스템 설계 및 플로우 차트
프로젝트의 전체적인 구조와 소프트웨어 흐름도입니다.

### 1-1. 시스템 설계도 (System Architecture)
<p align="center">
  <img src="./System%20Architecture.png" alt="시스템 설계도 이미지" width="600">
</p>



*설명: Ubuntu 환경에서 ROS 2 Humble을 기반으로 하며, Rosbridge Server를 통해 React 기반의 웹 인터페이스와 Doosan M0609 로봇 간의 실시간 양방향 통신을 구현한 구조입니다.*

### 1-2. 플로우 차트 (Flow Chart)
<p align="center">
  <img src="./Flow%20chart.png" alt="플로우 차트 이미지" width="400">
</p>



*설명: 고객의 주문 입력부터 관리자의 승인, 로봇의 경로 계획 및 그리퍼 동작, 최종 완료 알림까지의 전체 프로세스를 나타냅니다.*

---

## 2. 🖥️ 운영체제 환경 (OS Environment)
이 프로젝트는 다음 환경에서 개발 및 테스트되었습니다.

* **OS:** Ubuntu 22.04 LTS
* **ROS Version:** ROS 2 Humble
* **Language:** Python 3.10.12, Node.js (JavaScript)
* **IDE:** VS Code
* **로봇 드라이버/패키지:** * `dsr_bringup2` (런치 포함)
  * `DSR_ROBOT2` (Python API, 두산 로봇 제어)

---

## 3. 🛠️ 사용 장비 목록 (Hardware List)
프로젝트에 사용된 주요 하드웨어 장비입니다.

| 장비명 (Model) | 수량 | 비고 |
|:---:|:---:|:---|
| **Doosan Robotics M0609** | 1 | 메인 로봇 매니퓰레이터 |
| **Onrobot RG2** | 1 | 로봇 그리퍼 (End-Effector) |
| **Control PC** | 2 | Samsung/Asus Laptop (Static IP: 192.168.1.100) |
| **Ethernet Cable** | 1 | 로봇과 PC 간 유선 통신용 |

---

## 4. 📦 의존성 (Dependencies)
프로젝트 실행을 위해 다음 패키지들이 사전에 설치되어야 합니다.

### 4.1 시스템 및 ROS 2 패키지
* **ROS 2:** `ros-humble-desktop`, `ros-humble-rosbridge-server`
* **Robot Driver:** `dsr_bringup2` (Doosan Robot ROS 2 Driver)
* **Web Runtime:** `Node.js`, `npm`

### 4.2 Python 라이브러리
* **numpy:** 수치 계산 및 데이터 처리
* **opencv-python:** 영상 처리 및 컴퓨터 비전 알고리즘
* **기타:** `pip install -r requirements.txt` 명령어로 일괄 설치 가능

---

## 5. ▶️ 실행 순서 (Usage Guide)

터미널을 각각 열어 아래 순서대로 실행해 주세요.

### Step 1. M0609 로봇팔 통신 연결 (PC 1)
실제 로봇과 통신을 시작하고 Rviz를 통해 상태를 모니터링합니다.

ros2 launch dsr_bringup2 dsr_bringup2_rviz.launch.py mode:=real host:=192.168.1.100 port:=12345 model:=m0609


### Step 2. Rosbridge Server 구동 (PC 1)
웹 인터페이스와 ROS 2 노드 간 통신을 위한 브릿지를 실행합니다.

ros2 launch rosbridge_server rosbridge_websocket_launch.xml

### Step 3. 웹 모니터링 시스템 실행
각 대시보드를 로컬 서버로 구동합니다.

[고객용 모니터 - PC 1]

cd ~/ddaddaro_ws/custom_monitor
npm install
npm run dev

[관리자용 모니터 - PC 2]

cd ~/ddaddaro_ws/admin_monitor
npm install
npm run dev

### Step 4. 메인 제어 노드 실행 (PC 2)
로봇의 핵심 동작 알고리즘을 가동합니다.

ros2 run ddaddaro ddaddaro

---

📂 프로젝트 구조 (Structure)

ddaddaro: 메인 ROS 2 패키지 및 제어 로직 소스코드

custom_monitor: 고객 주문용 React 프론트엔드

admin_monitor: 관리자 관제용 React 프론트엔드

dsr_bringup2: 두산 로봇 하드웨어 인터페이스 설정 및 런칭 파일
