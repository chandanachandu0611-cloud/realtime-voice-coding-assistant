import { useEffect, useRef, useState } from 'react';

export function useAudioVisualizer(sourceNode: AudioNode | null) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [volume, setVolume] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sourceNode) {
      setVolume(0);
      return;
    }

    try {
      // Must use the exact same AudioContext as the source node
      const ctx = sourceNode.context as AudioContext;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      sourceNode.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setVolume(Math.min(1, avg / 128));

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        try {
          sourceNode.disconnect(analyser);
        } catch (e) {}
      };
    } catch (err) {
      console.error("Audio visualizer connection failed:", err);
    }
  }, [sourceNode]);

  return {
    analyserRef,
    volume,
    current: analyserRef.current
  };
}
