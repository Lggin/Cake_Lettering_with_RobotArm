//import React from 'react';
import React, { useState, useEffect, useRef } from 'react';
import './Home.css';
import logo from './assets/DDADDARO_LOGO.png';
import bgmFile from './assets/bgm.mp3';
import Confetti from './Confetti';

const Home = ({ onStart, isPlaying, onToggleMusic }) => {

  return (
    <div className="home-container">
      <Confetti />
      {/* 왼쪽: 로고 영역 */}
      <div className="left-panel">
        <img src={logo} alt="DDADDARO Big Logo" className="big-logo" />
      </div>

      <button className="music-toggle-btn" onClick={onToggleMusic}>
        {isPlaying ? '🔊' : '🔈'}
      </button>

      {/* 오른쪽: 박스 + 푸터 영역 */}
      <div className="right-panel">
        <div className="content-box">
          <div className="logo-area">
            <span role="img" aria-label="robot-cake">🤖🎂</span>
          </div>

          <h1 className="title-glow">DDADDARO BAKERY</h1>
          <p className="sub-title">나만의 특별한 레터링 케이크를 로봇과 함께 만들어보세요.</p>

          
          <div className="feature-list">
            <div className="feature-item" data-tooltip="원하는 그림을 직접 그려보세요!">
              <span className="icon">🎨</span>
              <span className="text">자유로운<br></br>디자인</span>
            </div>
            <div className="feature-item" data-tooltip="로봇팔이 한 땀 한 땀 그려드려요!">
              <span className="icon">🦾</span>
              <span className="text">로봇<br></br>정밀 제어</span>
            </div>
            <div className="feature-item" data-tooltip="작업 과정을 실시간으로 확인하세요!">
              <span className="icon">📸</span>
              <span className="text">실시간<br></br>확인</span>
            </div>
          </div>

          <div className="enter-btn-wrapper">
            {/* 별 입자들 */}
            <span className="sparkle s1">✨</span>
            <span className="sparkle s2">✨</span>
            <span className="sparkle s3">✨</span>
            <span className="sparkle s4">✨</span>
            
            <button className="enter-btn" onClick={onStart}>
              케이크 만들기 시작
            </button>
          </div>
        </div>
        
        {/* 박스 바로 아래에 위치하는 푸터 */}
        <p className="footer-text">
          © 2026 DOOSAN ROKEY BOOT CAMP | DDADDARO PROJECT
        </p>
      </div>
    </div>
  );
};

export default Home;