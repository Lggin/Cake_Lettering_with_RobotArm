import React, { useEffect, useState } from 'react';
import './Confetti.css';

const Confetti = () => {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    // 50개의 콘페티 조각 생성
    const newPieces = Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100, // 랜덤 가로 위치 (0-100%)
      delay: Math.random() * 5,  // 랜덤 시작 지연
      duration: 3 + Math.random() * 4, // 랜덤 낙하 속도
      size: 10 + Math.random() * 10, // 랜덤 크기
      color: ['#ffccd2', '#ff6b6b', '#fff', '#ffd93d', '#6bcbff'][Math.floor(Math.random() * 5)], // 베이커리 컬러팩
      rotation: Math.random() * 360,
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div className="confetti-container">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            width: `${p.size}px`,
            height: `${p.size / 2}px`, // 직사각형 모양
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};

export default Confetti;