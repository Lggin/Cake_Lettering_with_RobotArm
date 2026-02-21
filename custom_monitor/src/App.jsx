//-------------------------------------------------------------------------------
// 프로그램 명: DDADDARO Cake Design & Robot Control System (App.jsx)
// 주요 기능: 
//   1. HTML5 Canvas를 이용한 케이크 디자인 (텍스트, 이미지, 자유 드로잉)
//   2. 로봇(ROS2)과의 통신을 통한 디자인 데이터 전송 및 가동 명령
//   3. 실시간 진행률(Progress) 모니터링 및 완료 모달 알림
//   4. 드래그 앤 드롭 객체 이동 및 이미지 크기 조절(Resizing) 기능
//-------------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import * as ROSLIB from 'roslib';
import './App.css';
import Confetti from './Confetti';

//--------------------------------
// ROS 통신 및 토픽 관련 상수 정의
//--------------------------------
const ROS_BRIDGE_URL = 'ws://192.168.10.32:9090';
const CMD_TOPIC_NAME = '/user_input';
const PROGRESS_TOPIC_NAME = '/ddaddabot/progress_rate';
const IMAGE_TOPIC_NAME = '/ddaddabot/generated_image/compressed'; 

function App({ isPlaying, onToggleMusic }) {
  //--------------------------------
  // 1. 컴포넌트 상태 정의 (States)
  //--------------------------------
  const [textItems, setTextItems] = useState([
    { id: 1, text: '마음을 전해주세요', x: 500, y: 500, fontSize: 40, fontName: 'NanumGothic', rotation: 0 },
  ]);
  const [drawings, setDrawings] = useState([]); // 자유 드로잉 데이터 배열
  const [isDrawingMode, setIsDrawingMode] = useState(false); // 그리기 모드 활성화 여부
  const [currentPath, setCurrentPath] = useState([]); // 현재 그려지는 선의 좌표
  const [imageItems, setImageItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null); 
  const [selectedType, setSelectedType] = useState(null);
  const [cakeSize, setCakeSize] = useState('1');      
  const [status, setStatus] = useState('쉬고 있어요...');
  const [progress, setProgress] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const RESIZE_HANDLE_SIZE = 20; 
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  //---------------------------------------------------------------------------
  // 기능: 홈 버튼 클릭 처리
  //---------------------------------------------------------------------------
  const handleHomeClick = () => {
    window.location.href = '/'; 
  };

  //---------------------------------------------------------------------------
  // 기능: Canvas 실시간 렌더링 루프 (useEffect)
  // 설명: 상태 변화 시마다 캔버스를 초기화하고 가이드, 이미지, 텍스트, 드로잉을 순차적으로 그림
  //---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 2. 배경 가이드 레이어
    drawGrid(ctx);
    drawCakeGuide(ctx, cakeSize);
    
    // 3. 이미지 아이템 레이어
    imageItems.forEach(item => {
      const isSelected = (selectedType === 'image' && item.id === selectedId);
      renderImage(ctx, item, isSelected);
    });

    // 4. 텍스트 아이템 레이어
    textItems.forEach(item => {
      const isSelected = (selectedType === 'text' && item.id === selectedId);
      renderText(ctx, item, isSelected);
    });

    // 5. 자유 드로잉 레이어
    drawings.forEach(path => renderPath(ctx, path));

    // 6. 현재 드로잉 중인 경로 레이어
    if (currentPath.length > 0) {
      renderPath(ctx, { points: currentPath, color: 'black', width: 5 });
    }

    // 작업 완료 조건 감지
    if (progress >= 99) {
      setShowCompleteModal(true);
      setStatus('케이크가 완성되었습니다! 🎂');
    }
  }, [textItems, imageItems, drawings, currentPath, selectedId, selectedType, cakeSize, progress]);

  //---------------------------------------------------------------------------
  // 기능: 완료 모달 닫기
  //---------------------------------------------------------------------------
  const handleCloseCompleteModal = () => {
    setShowCompleteModal(false);
  };

  //---------------------------------------------------------------------------
  // 기능: 선(Path) 렌더링 함수
  // 설명: 좌표 배열을 받아 Canvas에 부드러운 선을 그림
  //---------------------------------------------------------------------------
  const renderPath = (ctx, path) => {
    if (path.points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = path.color || 'black';
    ctx.lineWidth = path.width || 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const canvasRef = useRef(null);
  const rosRef = useRef(null);
  const fileInputRef = useRef(null);

  // ROSLIB 클래스 호환성 처리
  const getRosClass = (className) => {
    if (ROSLIB[className]) return ROSLIB[className];
    if (ROSLIB.default && ROSLIB.default[className]) return ROSLIB.default[className];
    return undefined;
  };

  // 배경 그리드 렌더링
  const drawGrid = (ctx) => {
    ctx.save();
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 1000; i += 100) {
      ctx.moveTo(i, 0); ctx.lineTo(i, 1000);
      ctx.moveTo(0, i); ctx.lineTo(1000, i);
    }
    ctx.stroke();
    ctx.restore();
  };

  // 케이크 사이즈 가이드(원) 렌더링
  const drawCakeGuide = (ctx, sizeStr) => {
    const diameterCm = [15, 20, 27][parseInt(sizeStr) - 1]; 
    const pxPerCm = 1000 / 30; 
    const radiusPx = (diameterCm * pxPerCm) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(500, 500, radiusPx, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffccbc'; 
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  };

  // 이미지 객체 렌더링 (선택 시 핸들 포함)
  const renderImage = (ctx, item, isSelected) => {
    if (!item.imgElement) return;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.drawImage(item.imgElement, -item.width / 2, -item.height / 2, item.width, item.height);
    if (isSelected) {
      ctx.strokeStyle = 'green';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(-item.width / 2 - 5, -item.height / 2 - 5, item.width + 10, item.height + 10);
      ctx.setLineDash([]); 
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'green';
      ctx.lineWidth = 2;
      ctx.fillRect(item.width / 2 - 10, item.height / 2 - 10, 20, 20);
      ctx.strokeRect(item.width / 2 - 10, item.height / 2 - 10, 20, 20);
    }
    ctx.restore();
  };

  // 텍스트 객체 렌더링
  const renderText = (ctx, item, isSelected = false) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.font = `${item.fontSize}px "${item.fontName}", sans-serif`;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.text, 0, 0);
    if (isSelected) {
      const metrics = ctx.measureText(item.text);
      const width = metrics.width;
      const height = item.fontSize; 
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(-width / 2 - 10, -height / 2 - 10, width + 20, height + 20);
    }
    ctx.restore();
  };

  //---------------------------------------------------------------------------
  // 기능: 마우스/터치 좌표 변환
  //---------------------------------------------------------------------------
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // 객체 충돌 검사 (Hit Test) 함수군
  const isTextHit = (mx, my, item) => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.font = `${item.fontSize}px "${item.fontName}", sans-serif`;
    const metrics = ctx.measureText(item.text);
    const w = metrics.width;
    const h = item.fontSize;
    const dx = mx - item.x; const dy = my - item.y;
    const rad = (-item.rotation * Math.PI) / 180;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    return (localX >= -w / 2 - 10 && localX <= w / 2 + 10 && localY >= -h / 2 - 10 && localY <= h / 2 + 10);
  };

  const isImageHit = (mx, my, item) => {
    const w = item.width; const h = item.height;
    const dx = mx - item.x; const dy = my - item.y;
    const rad = (-item.rotation * Math.PI) / 180;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    return (localX >= -w / 2 && localX <= w / 2 && localY >= -h / 2 && localY <= h / 2);
  };

  // 리사이즈 핸들 충돌 검사
  const isHandleHit = (mx, my, item) => {
    const dx = mx - item.x; const dy = my - item.y;
    const rad = (-item.rotation * Math.PI) / 180;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    const handleX = item.width / 2; const handleY = item.height / 2;
    return (localX >= handleX - RESIZE_HANDLE_SIZE && localX <= handleX + RESIZE_HANDLE_SIZE &&
            localY >= handleY - RESIZE_HANDLE_SIZE && localY <= handleY + RESIZE_HANDLE_SIZE);
  };

  //---------------------------------------------------------------------------
  // 기능: 마우스 다운 이벤트 (선택 및 그리기 시작)
  //---------------------------------------------------------------------------
  const handleMouseDown = (e) => {
    if (isProcessing) return;
    const { x, y } = getCanvasCoordinates(e);

    if (isDrawingMode) {
      setIsDragging(true);
      setCurrentPath([{ x, y }]);
      return;
    }

    // 리사이즈 핸들 클릭 확인
    if (selectedType === 'image' && selectedId) {
      const item = imageItems.find(i => i.id === selectedId);
      if (item && isHandleHit(x, y, item)) {
        setIsResizing(true);
        setIsDragging(true);
        return;
      }
    }

    // 텍스트 선택 확인
    let clickedText = null;
    for (let i = textItems.length - 1; i >= 0; i--) {
      if (isTextHit(x, y, textItems[i])) { clickedText = textItems[i]; break; }
    }
    if (clickedText) {
      setSelectedId(clickedText.id); setSelectedType('text');
      setIsDragging(true); setDragOffset({ x: x - clickedText.x, y: y - clickedText.y });
      return;
    }

    // 이미지 선택 확인
    let clickedImage = null;
    for (let i = imageItems.length - 1; i >= 0; i--) {
      if (isImageHit(x, y, imageItems[i])) { clickedImage = imageItems[i]; break; }
    }
    if (clickedImage) {
      setSelectedId(clickedImage.id); setSelectedType('image');
      setIsDragging(true); setDragOffset({ x: x - clickedImage.x, y: y - clickedImage.y });
    } else {
      setSelectedId(null); setSelectedType(null);
    }
  };

  //---------------------------------------------------------------------------
  // 기능: 마우스 이동 이벤트 (드래그 및 리사이즈 수행)
  //---------------------------------------------------------------------------
  const handleMouseMove = (e) => {
    if (!isDragging || isProcessing) return;
    const { x, y } = getCanvasCoordinates(e);

    if (isDrawingMode) {
      setCurrentPath(prev => [...prev, { x, y }]);
    } else {
      if (selectedId === null) return;

      // 이미지 리사이즈 로직
      if (isResizing && selectedType === 'image') {
        setImageItems(prev => prev.map(item => {
          if (item.id === selectedId) {
            const dx = x - item.x; const dy = y - item.y;
            const rad = (-item.rotation * Math.PI) / 180;
            const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
            const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
            return { ...item, width: Math.max(40, localX * 2), height: Math.max(40, localY * 2) };
          }
          return item;
        }));
        return; 
      }

      // 일반 이동 로직
      if (selectedType === 'text') {
        setTextItems(prev => prev.map(item => item.id === selectedId ? { ...item, x: x - dragOffset.x, y: y - dragOffset.y } : item));
      } else if (selectedType === 'image') {
        setImageItems(prev => prev.map(item => item.id === selectedId ? { ...item, x: x - dragOffset.x, y: y - dragOffset.y } : item));
      }
    }
  };

  //---------------------------------------------------------------------------
  // 기능: 마우스 업 이벤트 (동작 종료)
  //---------------------------------------------------------------------------
  const handleMouseUp = () => {
    if (isDrawingMode && currentPath.length > 0) {
      setDrawings(prev => [...prev, { points: currentPath, color: 'black', width: 5 }]);
      setCurrentPath([]);
    }
    setIsDragging(false);
    setIsResizing(false);
  };

  //---------------------------------------------------------------------------
  // 기능: 자유 드로잉 전체 삭제
  //---------------------------------------------------------------------------
  const clearAllDrawings = () => {
    if (window.confirm("그린 그림을 모두 지우시겠습니까?")) {
      setDrawings([]);
    }
  };

  //---------------------------------------------------------------------------
  // 기능: 선택된 아이템(텍스트/이미지) 삭제
  //---------------------------------------------------------------------------
  const deleteSelectedItem = () => {
    if (selectedId === null) return;
    if (selectedType === 'text') {
      setTextItems(textItems.filter(item => item.id !== selectedId));
    } else if (selectedType === 'image') {
      setImageItems(imageItems.filter(item => item.id !== selectedId));
    }
    setSelectedId(null); setSelectedType(null);
  };

  // 신규 텍스트 추가
  const addTextItem = () => {
    const newId = Date.now();
    setTextItems([...textItems, { id: newId, text: '텍스트', x: 500, y: 500, fontSize: 50, fontName: 'NanumGothic', rotation: 0 }]);
    setSelectedId(newId); setSelectedType('text');
  };

  // 이미지 업로드 트리거
  const triggerImageUpload = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // 이미지 파일 로드 및 초기 설정
  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let w = img.width, h = img.height;
        const maxSize = 300;
        if (w > maxSize || h > maxSize) {
          const ratio = w / h;
          if (w > h) { w = maxSize; h = maxSize / ratio; }
          else { h = maxSize; w = maxSize * ratio; }
        }
        const newId = Date.now();
        setImageItems(prev => [...prev, { id: newId, imgElement: img, src: event.target.result, x: 500, y: 500, width: w, height: h, rotation: 0 }]);
        setSelectedId(newId); setSelectedType('image');
        e.target.value = null;
      };
    };
    reader.readAsDataURL(file);
  };

  // 선택 아이템 속성(회전, 내용 등) 업데이트
  const updateSelectedItem = (key, value) => {
    if (selectedId === null) return;
    if (selectedType === 'text') setTextItems(prev => prev.map(item => item.id === selectedId ? { ...item, [key]: value } : item));
    else if (selectedType === 'image') setImageItems(prev => prev.map(item => item.id === selectedId ? { ...item, [key]: value } : item));
  };

  let selectedItem = (selectedType === 'text') ? (textItems.find(i => i.id === selectedId) || {}) : (imageItems.find(i => i.id === selectedId) || {});

  //---------------------------------------------------------------------------
  // 기능: 작업 시작 핸들러
  //---------------------------------------------------------------------------
  const handleStartClick = () => setShowConfirmModal(true);
  const handleConfirmStart = () => {
    setShowConfirmModal(false);
    setIsProcessing(true);
    const Ros = getRosClass('Ros');
    const Topic = getRosClass('Topic');
    if (!Ros || !Topic) {
      setStatus('ROSLIB 로드 실패'); setIsProcessing(false); return;
    }
    if (!rosRef.current || !rosRef.current.isConnected) {
      connectROS(Ros, Topic, () => startTaskSequence(rosRef.current, Topic));
    } else {
      startTaskSequence(rosRef.current, Topic);
    }
  };

  //---------------------------------------------------------------------------
  // 기능: ROS 연결 수립 및 토픽 구독
  //---------------------------------------------------------------------------
  const connectROS = (Ros, Topic, onConnectedCallback) => {
    setStatus('ROS 연결 시도 중...');
    try {
      const ros = new Ros({ url: ROS_BRIDGE_URL });
      ros.on('connection', () => {
        setStatus('시스템 가동,, 준비 완료!');
        rosRef.current = ros;
        const progressTopic = new Topic({ ros: ros, name: PROGRESS_TOPIC_NAME, messageType: 'std_msgs/msg/Int32' });
        progressTopic.subscribe((msg) => setProgress(parseFloat(msg.data)));
        if (onConnectedCallback) onConnectedCallback();
      });
      ros.on('error', () => { setStatus('연결 오류'); setIsProcessing(false); });
      ros.on('close', () => { setStatus('연결 종료'); setIsProcessing(false); });
    } catch (e) {
      setStatus('내부 오류: ' + e.message); setIsProcessing(false);
    }
  };

  // 작업 전송 시퀀스 실행
  const startTaskSequence = (ros, Topic) => {
    try {
      publishImage(ros, Topic);
      setTimeout(() => publishPayload(ros, Topic), 500);
    } catch (e) {
      setStatus('작업 전송 중 오류 발생'); setIsProcessing(false);
    }
  };

  //---------------------------------------------------------------------------
  // 기능: 캔버스 디자인을 이미지로 변환하여 ROS 전송
  //---------------------------------------------------------------------------
  const publishImage = (ros, Topic) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1000; tempCanvas.height = 1000;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.fillStyle = 'white';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // 객체 순차 렌더링 (디자인 데이터 이미지화)
    imageItems.forEach(item => renderImage(tCtx, item, false));
    textItems.forEach(item => renderText(tCtx, item, false));
    drawings.forEach(path => renderPath(tCtx, path));

    const base64Data = tempCanvas.toDataURL("image/jpeg").replace(/^data:image\/jpeg;base64,/, "");
    const imageTopic = new Topic({ ros: ros, name: IMAGE_TOPIC_NAME, messageType: 'sensor_msgs/CompressedImage' });
    imageTopic.publish({ header: { frame_id: "map" }, format: "jpeg", data: base64Data });
  };

  //---------------------------------------------------------------------------
  // 기능: 작업 파라미터(사이즈, 텍스트정보 등)를 JSON으로 ROS 전송
  //---------------------------------------------------------------------------
  const publishPayload = (ros, Topic) => {
    const cmdTopic = new Topic({ ros: ros, name: CMD_TOPIC_NAME, messageType: 'std_msgs/String' });
    const payload = {
      cake_size: parseInt(cakeSize),
      text_items: textItems.map(item => ({ text: item.text, x: item.x, y: item.y, font_name: item.fontName, font_size: item.fontSize, rotation: item.rotation })),
      image_items: imageItems.map(item => ({ x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation }))
    };
    cmdTopic.publish({ data: JSON.stringify(payload) });
    setStatus('나만의 케이크 만드는 중...');
    setProgress(0);
    setTimeout(() => setIsProcessing(false), 2000);
  };

  //--------------------------------
  // UI 렌더링 (JSX)
  //--------------------------------
  return (
    <div className="container">
      {/* 장식 및 상단 고정 버튼 */}
      <Confetti />
      <button className="music-toggle-btn-fixed" onClick={onToggleMusic}>
        {isPlaying ? '🔊' : '🔈'}
      </button>
      <button className="home-fixed-btn" onClick={handleHomeClick} title="홈으로 이동">
        <span className="home-icon">🏠</span>
      </button>
      <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageFileChange} />

      {/* 작업 시작 확인 모달 */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p>🎂 케이크 레터링을<br></br>시작하시겠습니까?</p>
            <div className="modal-buttons">
              <button className="modal-btn btn-confirm" onClick={handleConfirmStart}>확인</button>
              <button className="modal-btn btn-cancel" onClick={() => setShowConfirmModal(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 작업 완료 알림 모달 */}
      {showCompleteModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-box" style={{ border: '3px solid #4caf50' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '15px' }}>🎉 완성!</h2>
            <p>나만의 케이크가 완성되었습니다!</p>
            <div className="modal-buttons">
              <button className="modal-btn btn-confirm" onClick={handleCloseCompleteModal} style={{ width: '100%', backgroundColor: '#4caf50' }}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 디자인 캔버스 영역 */}
      <div className="canvas-area">
        <canvas 
          ref={canvasRef} width={1000} height={1000} 
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onTouchStart={(e) => handleMouseDown(e.touches[0])}
          onTouchMove={(e) => handleMouseMove(e.touches[0])}
          onTouchEnd={handleMouseUp}
        />
      </div>

      {/* 디자인 컨트롤 패널 */}
      <div className="control-panel">
        <div className="section-title">DDADDARO</div>
        
        {/* 설정 영역: 케이크 사이즈 */}
        <div className="input-group">
          <label>케이크 사이즈</label>
          <select value={cakeSize} onChange={(e) => setCakeSize(e.target.value)} disabled={isProcessing}>
            <option value="1">1호 (15cm)</option>
            <option value="2">2호 (20cm)</option>
            <option value="3">3호 (27cm)</option>
          </select>
        </div>
        
        {/* 드로잉 및 객체 추가 제어 버튼 */}
        <div className="item-controls">
            <button className={`draw-toggle-btn add-btn ${isDrawingMode ? 'btn-drawing' : 'btn-ready'}`} onClick={() => setIsDrawingMode(!isDrawingMode)} style={{ flex: 2 }}>
              {isDrawingMode ? (<><span>●</span> 그리기 중 (클릭시 종료)</>) : (<><span>✏️</span> 그리기 시작</>)}
            </button>
            <button className="del-btn" onClick={clearAllDrawings} disabled={drawings.length === 0} style={{ backgroundColor: '#ff9800' }}>그림 초기화</button>
        </div>

        <div className="item-controls" style={{ marginTop: '10px' }}>
          <button className="add-btn" onClick={addTextItem}>+ 텍스트</button>
          <button className="add-btn" onClick={triggerImageUpload} style={{ backgroundColor: '#4CAF50' }}>+ 이미지</button>
          <button className="del-btn" onClick={deleteSelectedItem} disabled={!selectedId} style={{ backgroundColor: selectedId ? '#e53935' : '#ccc' }}>선택삭제</button>
        </div>

        {/* 상세 설정 영역 (선택된 요소에 따라 가변적 노출) */}
        {selectedId ? (
          <>
            {selectedType === 'text' && (
              <>
                <div className="input-group">
                  <label>내용</label>
                  <input type="text" value={selectedItem.text || ''} onChange={(e) => updateSelectedItem('text', e.target.value)} disabled={isProcessing} />
                </div>
                <div className="input-row" style={{ display: 'flex', gap: '10px' }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>폰트</label>
                    <select value={selectedItem.fontName || 'NanumGothic'} onChange={(e) => updateSelectedItem('fontName', e.target.value)} disabled={isProcessing}>
                      <option value="NanumGothic">나눔고딕</option>
                      <option value="Nanum Myeongjo">나눔명조</option>
                      <option value="NanumSquare">나눔스퀘어</option>
                      <option value="NanumBarunGothic">나눔바른고딕</option>
                      <option value="Nanum Brush Script">나눔붓글씨</option>
                      <option value="Nanum Pen Script">나눔펜글씨</option>
                    </select>
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>크기</label>
                    <input type="number" value={selectedItem.fontSize || 100} onChange={(e) => updateSelectedItem('fontSize', parseInt(e.target.value))} disabled={isProcessing} />
                  </div>
                </div>
              </>
            )}
            {selectedType === 'image' && (
              <div className="input-row" style={{ display: 'flex', gap: '10px' }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label>가로 크기 (px)</label>
                  <input type="number" value={parseInt(selectedItem.width) || 100} onChange={(e) => updateSelectedItem('width', parseInt(e.target.value))} disabled={isProcessing} />
                </div>
                <div className="input-group" style={{ flex: 1 }}>
                  <label>세로 크기 (px)</label>
                  <input type="number" value={parseInt(selectedItem.height) || 100} onChange={(e) => updateSelectedItem('height', parseInt(e.target.value))} disabled={isProcessing} />
                </div>
              </div>
            )}
            <div className="input-group">
              <label>회전 (각도: {selectedItem.rotation || 0}°)</label>
              <input type="range" min="-180" max="180" value={selectedItem.rotation || 0} onChange={(e) => updateSelectedItem('rotation', parseInt(e.target.value))} disabled={isProcessing} />
            </div>
          </>
        ) : (
          <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>글이나 그림으로 마음을 담아보세요!</div>
        )}

        {/* 하단 진행률 및 가동 버튼 영역 */}
        <div className="progress-area">
          <label>진행률 : {progress.toFixed(1)}%</label>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#2196F3' : '#4caf50', boxShadow: '0 0 10px rgba(76, 175, 80, 0.5)' }}></div>
          </div>
        </div>

        <div className="status-log"><strong>로봇 상태 :</strong> {status}</div>

        <div className="action-buttons">
          <button className="save-btn" onClick={handleStartClick} disabled={isProcessing}>
            {isProcessing ? '처리 중...' : '작업 시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;