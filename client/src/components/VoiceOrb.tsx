'use client';

import React, { useEffect, useRef } from 'react';

interface VoiceOrbProps {
  status: 'idle' | 'listening' | 'speaking';
  volume: number; // 0 to 1
}

export function VoiceOrb({ status, volume }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute dynamic scale and blur based on volume (0 to 1)
  const clampedVolume = Math.max(0, Math.min(1, volume));
  const scale = 1 + clampedVolume * 0.35;
  const blurGlowRadius = 16 + clampedVolume * 45;
  const baseFreq = 0.012 + clampedVolume * 0.038;
  const displacementScale = 12 + clampedVolume * 50;

  // Colors based on status
  let gradientStops = {
    stop0: '#c084fc', // purple-400
    stop50: '#8b5cf6', // violet-500
    stop100: '#4c1d95', // violet-900
    glowColor: 'rgba(139, 92, 246, 0.4)',
    pulseColor: 'bg-purple-500/20',
    borderColor: 'rgba(168, 85, 247, 0.4)',
    waveColor: 'rgba(192, 132, 252, 0.6)',
  };

  if (status === 'speaking') {
    gradientStops = {
      stop0: '#6ee7b7', // mint
      stop50: '#10b981', // emerald
      stop100: '#047857', // deep emerald
      glowColor: 'rgba(16, 185, 129, 0.55)',
      pulseColor: 'bg-emerald-500/25',
      borderColor: 'rgba(52, 211, 153, 0.5)',
      waveColor: 'rgba(110, 231, 183, 0.8)',
    };
  } else if (status === 'listening') {
    gradientStops = {
      stop0: '#67e8f9', // cyan-300
      stop50: '#06b6d4', // cyan-500
      stop100: '#1d4ed8', // blue-700
      glowColor: 'rgba(6, 182, 212, 0.55)',
      pulseColor: 'bg-cyan-500/25',
      borderColor: 'rgba(103, 232, 249, 0.5)',
      waveColor: 'rgba(103, 232, 249, 0.8)',
    };
  }

  // Render reactive particle canvas ring
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.04;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const numBars = 48;
      const baseRadius = 88;

      ctx.save();
      ctx.translate(centerX, centerY);

      for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * Math.PI * 2;
        const wave = Math.sin(angle * 5 + time) * 6 + Math.cos(angle * 3 - time * 1.5) * 4;
        const barHeight = 6 + clampedVolume * 40 + wave * (0.5 + clampedVolume);

        const x1 = Math.cos(angle) * baseRadius;
        const y1 = Math.sin(angle) * baseRadius;
        const x2 = Math.cos(angle) * (baseRadius + barHeight);
        const y2 = Math.sin(angle) * (baseRadius + barHeight);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = gradientStops.waveColor;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Outer dot particle
        if (i % 2 === 0) {
          const dotRadius = baseRadius + barHeight + 6;
          const px = Math.cos(angle) * dotRadius;
          const py = Math.sin(angle) * dotRadius;
          ctx.beginPath();
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = gradientStops.waveColor;
          ctx.fill();
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [clampedVolume, gradientStops.waveColor]);

  return (
    <div className="relative flex items-center justify-center w-80 h-80 my-2 select-none">
      {/* Background Canvas Particle Ring */}
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Multi-Ring Reactive Shockwaves */}
      <div
        className="absolute rounded-full border transition-all duration-150 pointer-events-none z-0"
        style={{
          width: `${200 + clampedVolume * 110}px`,
          height: `${200 + clampedVolume * 110}px`,
          borderColor: gradientStops.borderColor,
          opacity: status !== 'idle' ? 0.35 + clampedVolume * 0.5 : 0.15,
          transform: `scale(${1 + clampedVolume * 0.15})`,
        }}
      />
      <div
        className="absolute rounded-full border transition-all duration-300 pointer-events-none z-0"
        style={{
          width: `${240 + clampedVolume * 140}px`,
          height: `${240 + clampedVolume * 140}px`,
          borderColor: gradientStops.borderColor,
          opacity: status !== 'idle' ? 0.2 + clampedVolume * 0.4 : 0.08,
          transform: `scale(${1 + clampedVolume * 0.25})`,
        }}
      />

      {/* Outer ambient pulse ring */}
      <div
        className={`absolute inset-6 rounded-full transition-all duration-700 ease-out z-0 ${
          status === 'listening' ? 'animate-ping opacity-25' : 'opacity-0'
        } ${gradientStops.pulseColor}`}
      />

      {/* Main Fluid SVG Orb */}
      <div
        className="relative z-10 w-52 h-52 transition-transform duration-100 ease-out flex items-center justify-center cursor-pointer"
        style={{
          transform: `scale(${scale})`,
          filter: `drop-shadow(0 0 ${blurGlowRadius}px ${gradientStops.glowColor})`,
        }}
      >
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <radialGradient id="orbGradient" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor={gradientStops.stop0} />
              <stop offset="55%" stopColor={gradientStops.stop50} />
              <stop offset="100%" stopColor={gradientStops.stop100} />
            </radialGradient>

            <filter id="liquidFluidBloom" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={baseFreq}
                numOctaves="3"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  values={`${baseFreq};${baseFreq * 1.35};${baseFreq}`}
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={displacementScale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="displaced"
              />
              <feGaussianBlur in="displaced" stdDeviation="2" result="blurred" />
              <feMerge>
                <feMergeNode in="blurred" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx="100"
            cy="100"
            r="68"
            fill="url(#orbGradient)"
            filter="url(#liquidFluidBloom)"
          />
        </svg>
      </div>
    </div>
  );
}
