import React, { useState, useRef } from 'react';
import Home from './Home';
import App from './App'; // 기존에 만드신 App.jsx
import bgmFile from './assets/bgm.mp3';

// [이 파일의 역할]
// - 프로그램의 최상위 컨테이너입니다.
// - 현재 사용자가 '대기 화면(Home)'에 있는지 '작업 화면(App)'에 있는지 상태를 관리하고 화면을 전환합니다.

function Main() {
  // 화면 상태 관리 (false: 홈 화면, true: 작업 화면)
  const [isStarted, setIsStarted] = useState(false);
  const [view, setView] = useState('home'); // 'home' or 'app'
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const toggleMusic = () => {
    if (audioRef.current) {
      isPlaying ? audioRef.current.pause() : audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  // 시작 버튼 핸들러
  const handleStart = () => {
    setIsStarted(true);
  };

  return (
    <div className="main-layout">
      {/* 오디오 태그를 최상위에 두어 페이지 이동 시에도 유지 */}
      <audio ref={audioRef} src={bgmFile} loop />
      
      {/* 현재 재생 상태와 제어 함수를 각 컴포넌트에 전달 */}
      {view === 'home' ? (
        <Home onStart={() => setView('app')} isPlaying={isPlaying} onToggleMusic={toggleMusic} />
      ) : (
        <App isPlaying={isPlaying} onToggleMusic={toggleMusic} />
      )}
    </div>
  );
}

export default Main;