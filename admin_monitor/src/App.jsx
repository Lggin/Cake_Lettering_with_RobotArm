//-------------------------------------------------------------------------------
// 프로그램 명: Robot Admin Dashboard (App.jsx)
// 주요 기능: 
//   1. React 기반의 로봇 제어 웹 인터페이스 (Frontend)
//   2. roslib를 통한 ROS Bridge 서버 연결 및 양방향 통신
//   3. 로봇의 실시간 상태(모드, TCP, Tool, 동작 상태) 모니터링 및 시각화
//   4. 서비스 호출을 통한 로봇 제어(Pause/Resume, Mode Switch, TCP/Tool Set)
//-------------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import * as ROSLIB from 'roslib';
import './App.css';
import smallLogo from './assets/small_LOGO.png';

//--------------------------------
// ROS 통신 및 시스템 관련 상수
//--------------------------------
const ROS_BRIDGE_URL = 'ws://192.168.10.32:9090';
const PROGRESS_TOPIC = '/ddaddabot/progress_rate';
const ROBOT_STATE_SERVICE = '/dsr01/system/set_robot_state'; 

//--------------------------------
// 로봇 상태 ID 정의 (DSR Status Map)
//--------------------------------
const ROBOT_STATE_MAP = {
  0: { name: '초기화 중', constant: 'STATE_INITIALIZING', color: '#ffffff' },
  1: { name: '대기 중 (정상)', constant: 'STATE_STANDBY', color: '#ffffff' },
  2: { name: '이동 중', constant: 'STATE_MOVING', color: '#2196f3' },
  3: { name: '서보 꺼짐', constant: 'STATE_SAFE_OFF', color: '#ff4444' },
  4: { name: '티칭 모드', constant: 'STATE_TEACHING', color: '#00bcd4' },
  5: { name: '안전 정지', constant: 'STATE_SAFE_STOP', color: '#ffeb3b' },
  6: { name: '비상 정지', constant: 'STATE_EMERGENCY_STOP', color: '#ff4444' },
  7: { name: '원점 복귀 중', constant: 'STATE_HOMMING', color: '#9c27b0' },
  8: { name: '복구 모드', constant: 'STATE_RECOVERY', color: '#ff9800' },
  9: { name: '보호 정지 2', constant: 'STATE_SAFE_STOP2', color: '#ffeb3b' },
  10: { name: '서보 꺼짐 2', constant: 'STATE_SAFE_OFF2', color: '#ff4444' },
  15: { name: '준비 안 됨', constant: 'STATE_NOT_READY', color: '#757575' }
};

const Admin = () => {
  //--------------------------------
  // 컴포넌트 상태 관리 (Hooks)
  //--------------------------------
  const [progress, setProgress] = useState(0);
  const [robotStatus, setRobotStatus] = useState('CONNECTED');
  const [currentTcp, setCurrentTcp] = useState('Loading...');
  const [currentTool, setCurrentTool] = useState('Loading...');
  const [robotMode, setRobotMode] = useState('Loading...');
  const [robotStateDetail, setRobotStateDetail] = useState('Unknown');
  const [currentStateId, setCurrentStateId] = useState(1);
  const [log, setLog] = useState(['관리자 시스템이 시작되었습니다.']);
  const rosRef = useRef(null);

  //---------------------------------------------------------------------------
  // 기능: ROS 초기 연결 및 구독(Subscription) 설정
  // 설명: 컴포넌트 마운트 시 ROS Bridge 연결 및 진행률 토픽 구독 활성화
  //---------------------------------------------------------------------------
  useEffect(() => {
    const ros = new ROSLIB.Ros({ url: ROS_BRIDGE_URL });
    rosRef.current = ros;

    ros.on('connection', () => {
      if (rosRef.current.isConnected) { 
        addLog('ROS Bridge와 연결되었습니다.');
        fetchCurrentSettings();
      }
    });

    const stateTimer = setInterval(() => {
      if (rosRef.current && rosRef.current.isConnected) {
        updateRobotStateDetail();
      }
    }, 2000);

    const progressListener = new ROSLIB.Topic({
      ros: ros,
      name: PROGRESS_TOPIC,
      messageType: 'std_msgs/Int32'
    });

    progressListener.subscribe((message) => {
      setProgress(message.data);
    });

    return () => {
      clearInterval(stateTimer);
      progressListener.unsubscribe();
      ros.close();
    };
  }, []);
  
  //---------------------------------------------------------------------------
  // 기능: 로봇 상세 상태 정보 업데이트
  // 설명: get_robot_state 서비스를 호출하여 상태 ID를 받아오고 UI용 정보로 변환
  //---------------------------------------------------------------------------
  const updateRobotStateDetail = () => {
    const stateService = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/system/get_robot_state',
      serviceType: 'dsr_msgs2/srv/GetRobotState'
    });

    stateService.callService({}, (result) => {
      if (result && result.success) {
        const stateId = result.robot_state;
        setCurrentStateId(stateId);

        const stateInfo = ROBOT_STATE_MAP[stateId] || { name: `알 수 없음 (${stateId})`, color: '#888' };
        setRobotStateDetail(stateInfo.name);
      }
    }, (err) => console.error("상태 조회 실패:", err));
  };

  //---------------------------------------------------------------------------
  // 기능: 현재 로봇 설정 데이터(TCP, Tool, Mode) 동기화
  // 설명: 로봇 컨트롤러에 쿼리를 보내 현재 선택된 파라미터 정보를 가져옴
  //---------------------------------------------------------------------------
  const fetchCurrentSettings = () => {
    const tcpService = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/tcp/get_current_tcp',
      serviceType: 'dsr_msgs2/srv/GetCurrentTcp'
    });

    tcpService.callService({}, (result) => {
      console.log("TCP Response:", result);
      if (result && result.success) {
        setCurrentTcp(result.info); 
      }
    }, (error) => {
      console.error("TCP 조회 실패:", error);
    });

    const toolService = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/tool/get_current_tool',
      serviceType: 'dsr_msgs2/srv/GetCurrentTool'
    });

    toolService.callService({}, (result) => {
      console.log("Tool Response:", result);
      if (result && result.success) {
        setCurrentTool(result.info);
      }
    }, (error) => {
      console.error("Tool 조회 실패:", error);
    });

    const modeService = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/system/get_robot_mode',
      serviceType: 'dsr_msgs2/srv/GetRobotMode'
    });

    modeService.callService({}, (result) => {
      if (result && result.success) {
        const modeText = result.robot_mode === 0 ? 'MANUAL' : 'AUTO';
        setRobotMode(modeText);
      }
    });
  };

  //---------------------------------------------------------------------------
  // 기능: 수동/자동 모드 토글 (Mode Switching)
  // 설명: 사용자의 요청에 따라 로봇의 제어 권한(Manual <-> Auto)을 전환
  //---------------------------------------------------------------------------
  const handleToggleMode = () => {
    if (!rosRef.current) return;

    const service = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/system/set_robot_mode',
      serviceType: 'dsr_msgs2/srv/SetRobotMode'
    });

    const nextMode = robotMode === 'MANUAL' ? 1 : 0;
    const nextModeText = nextMode === 1 ? 'AUTO' : 'MANUAL';

    addLog(`로봇 모드를 ${nextModeText}(으)로 전환 요청 중...`);

    service.callService({ robot_mode: nextMode }, (result) => {
      if (result && result.success) {
        setRobotMode(nextModeText);
        setRobotStatus(nextModeText === 'MANUAL' ? 'MANUAL' : 'CONNECTED');
        addLog(`로봇이 ${nextModeText} 모드로 전환되었습니다.`);
      } else {
        addLog(`${nextModeText} 모드 전환 실패: 로봇이 거부했습니다.`);
      }
    }, (error) => {
      console.error("Mode Service Error:", error);
      addLog('모드 전환 서비스 호출 오류');
    });
  };

  //---------------------------------------------------------------------------
  // 기능: TCP 설정 명령 전송
  // 설명: 특정 툴의 좌표계(TCP)를 로봇에 적용
  //---------------------------------------------------------------------------
  const handleSetTcp = (tcpName) => {
    if (!rosRef.current) return;
    const service = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/tcp/set_current_tcp',
      serviceType: 'dsr_msgs2/srv/SetCurrentTcp'
    });
    const request = { name: tcpName };

    addLog(`TCP 설정 요청 중: ${tcpName}...`);

    service.callService(request, (result) => {
      console.log("TCP Set Result:", result);
      if (result && result.success) {
        setCurrentTcp(tcpName); 
        addLog(`TCP가 [${tcpName}]으로 변경되었습니다.`);
      } else {
        addLog('TCP 변경 실패: 로봇이 요청을 거부했습니다.');
      }
    }, (error) => {
      console.error("TCP Service Error:", error);
      addLog('TCP 서비스 호출 오류 발생');
    });
  };

  //---------------------------------------------------------------------------
  // 기능: Tool 정보 설정 명령 전송
  // 설명: 현재 장착된 툴의 중량 및 특성 정보를 로봇에 적용
  //---------------------------------------------------------------------------
  const handleSetTool = (toolName) => {
    if (!rosRef.current) return;

    const service = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/tool/set_current_tool',
      serviceType: 'dsr_msgs2/srv/SetCurrentTool'
    });

    const request = { name: toolName };

    addLog(`Tool 설정 요청 중: ${toolName}...`);

    service.callService(request, (result) => {
      console.log("Tool Set Result:", result);
      if (result && result.success) {
        setCurrentTool(toolName);
        addLog(`Tool이 [${toolName}]으로 변경되었습니다.`);
      } else {
        addLog('Tool 변경 실패: 로봇이 요청을 거부했습니다.');
      }
    }, (error) => {
      console.error("Tool Service Error:", error);
      addLog('Tool 서비스 호출 오류 발생');
    });
  };

  //---------------------------------------------------------------------------
  // 기능: 로봇 모션 일시 정지 (Move Pause)
  // 설명: 구동 중인 로봇의 움직임을 즉시 멈춤
  //---------------------------------------------------------------------------
  const handlePause = () => {
    if (!rosRef.current) return;

    const pauseService = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/motion/move_pause', 
      serviceType: 'dsr_msgs2/srv/MovePause' 
    });

    addLog('일시 정지(Pause) 명령 전송 중...');

    pauseService.callService({}, (result) => {
      console.log("Pause 성공:", result);
      setRobotStatus('PAUSED');
      addLog('로봇이 일시 정지되었습니다.');
    }, (error) => {
      console.error("Pause 에러:", error);
      addLog('일시 정지 명령 실패: ' + error);
    });
  };

  //---------------------------------------------------------------------------
  // 기능: 로봇 모션 재개 (Move Resume)
  // 설명: 일시 정지 상태인 로봇의 작업을 다시 시작
  //---------------------------------------------------------------------------
  const handleResume = () => {
    if (!rosRef.current) return;

    const resumeService = new ROSLIB.Service({
      ros: rosRef.current,
      name: '/dsr01/motion/move_resume',
      serviceType: 'dsr_msgs2/srv/MoveResume'
    });

    addLog('작업 재개(Resume) 명령 전송 중...');

    resumeService.callService({}, (result) => {
      console.log("Resume 성공:", result);
      setRobotStatus('CONNECTED'); 
      addLog('로봇이 작업을 재개합니다.');
    }, (error) => {
      console.error("Resume 에러:", error);
      addLog('작업 재개 명령 실패: ' + error);
    });
  };

  //---------------------------------------------------------------------------
  // 기능: 시스템 로그 메시지 추가
  // 설명: 최신 로그가 상단에 오도록 하며 최대 10개까지 유지
  //---------------------------------------------------------------------------
  const addLog = (msg) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 10));
  };

//--------------------------------
// 컴포넌트 렌더링 (JSX)
//--------------------------------
return (
    <div className="admin-wrapper">
      {/* 1. 상단 헤더 섹션 (Logo & Status) */}
      <header className="admin-header">
        <div className="header-left">
          <img src={smallLogo} alt="Logo" className="admin-logo" />
        </div>
        <div className="header-center">
          <h1 className="system-title">ADMIN PANEL</h1>
        </div>
        <div className="header-right">
          <div className={`status-badge ${robotStatus.toLowerCase()}`}>
            <span className="dot"></span> {robotStatus}
          </div>
        </div>
      </header>

      {/* 2. 메인 대시보드 레이아웃 */}
      <main className="admin-main-content">
        
        {/* 좌측 패널: 로봇 진행도 시각화 */}
        <section className="admin-panel progress-panel">
          <div className="admin-card">
            <h2 className="card-label">Robot Progress</h2>
            <div className="visual-chart-area">
              <svg viewBox="0 0 36 36" className="circular-chart-responsive">
                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="circle" 
                  strokeDasharray={`${progress}, 100`} 
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                />
                <text x="18" y="20.35" className="percentage-text">{progress}%</text>
              </svg>
            </div>
            <p className="status-indicator">ROBOT IS CURRENTLY OPERATING</p>
          </div>
        </section>

        {/* 우측 패널: 상세 정보 및 제어부 */}
        <section className="admin-panel control-panel">
          <div className="admin-card stop-section">
            <h2 className="card-label">System Control</h2>

            {/* 현재 로봇 파라미터 정보 그리드 */}
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Current Mode</span>
                <span className={`info-value mode-highlight ${robotMode.toLowerCase()}`}>
                  {robotMode}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Current TCP</span>
                <span className="info-value">{currentTcp || 'None'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Current Tool</span>
                <span className="info-value">{currentTool || 'None'}</span>
              </div>
            </div>

            {/* 실시간 상태 모니터링 표시바 */}
            <div className={`state-monitor-bar state-${currentStateId}`}>
              <div className="monitor-left">
                <span className="monitor-label">SYSTEM STATE</span>
                <span className="monitor-value">{robotStateDetail}</span>
              </div>
              <div className="state-led-indicator"></div>
            </div>

            {/* 동작 설정 및 모드 전환 버튼군 */}
            <div className="control-button-group">
              <button 
                className={`sub-btn mode-toggle-btn ${robotMode === 'MANUAL' ? 'to-auto' : 'to-manual'}`} 
                onClick={handleToggleMode}
              >
                {robotMode === 'MANUAL' ? '🔄 SWITCH TO AUTO' : '🔄 SWITCH TO MANUAL'}
              </button>

              <button className="sub-btn" onClick={() => handleSetTcp('GripperDA_v1')}>
                SET TCP (Gripper)
              </button>
              <button className="sub-btn" onClick={() => handleSetTool('Tool Weight')}>
                SET TOOL (Weight)
              </button>
            </div>

            <hr className="divider" />

            {/* 비상 정지(Pause) 및 재개(Resume) 제어부 */}
            {robotStatus === 'PAUSED' ? (
              <button className="resume-btn" onClick={handleResume}>
                <span className="icon">▶️</span> RESUME
              </button>
            ) : (
              <button className="emergency-stop-btn" onClick={handlePause}>
                <span className="icon">🛑</span> STOP
              </button>
            )}
          </div>

          {/* 시스템 이벤트 로그 출력 패널 */}
          <div className="admin-card log-section">
            <h2 className="card-label">System Logs</h2>
            <div className="log-scroll-area">
              {log.map((entry, i) => (
                <div key={i} className="log-row">
                  <span className="message">{entry}</span>
                </div>
              ))}
              <div id="log-bottom"></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Admin;