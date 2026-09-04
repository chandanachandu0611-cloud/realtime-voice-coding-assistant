'use client';

import { useState, useRef, useEffect } from 'react';
import { floatTo16BitPCM, base64ToUint8Array, pcm24kToAudioBuffer } from '@/utils/audio';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import { VoiceOrb } from '@/components/VoiceOrb';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';

interface TranscriptMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const VOICES = [
  { id: 'Puck', name: 'Puck (Warm & Friendly)' },
  { id: 'Charon', name: 'Charon (Deep & Authoritative)' },
  { id: 'Kore', name: 'Kore (Calm & Natural)' },
  { id: 'Fenrir', name: 'Fenrir (Energetic & Direct)' },
  { id: 'Aoede', name: 'Aoede (Expressive & Melodic)' },
];

const PERSONAS = [
  {
    id: 'concise',
    label: 'Concise Partner',
    prompt: 'You are a concise, helpful real-time AI voice assistant. Keep answers direct and brief.',
  },
  {
    id: 'code_mentor',
    label: 'Code Mentor',
    prompt: 'You are an expert Software Architect and Senior Code Mentor. Provide clean, clear technical insight.',
  },
  {
    id: 'creative',
    label: 'Creative Brainstormer',
    prompt: 'You are an imaginative creative collaborator. Generate innovative ideas with high enthusiasm.',
  },
];

function renderSyntaxHighlightedCode(code: string, language: string) {
  const lines = code.split('\n');
  const lang = (language || '').toLowerCase();

  const isKeyword = (word: string) => {
    const cppKeywords = ['#include', 'int', 'void', 'char', 'float', 'double', 'bool', 'return', 'if', 'else', 'for', 'while', 'using', 'namespace', 'std', 'cout', 'endl', 'cin', 'struct', 'class', 'public', 'private', 'const', 'auto', 'new', 'delete', 'main'];
    const pyKeywords = ['def', 'import', 'from', 'as', 'return', 'if', 'else', 'elif', 'for', 'while', 'in', 'range', 'print', 'class', 'self', 'True', 'False', 'None', 'try', 'except', 'with', 'lambda'];
    const jsKeywords = ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'default', 'async', 'await', 'console', 'log', 'null', 'undefined', 'true', 'false'];
    
    const keywords = lang.includes('py') ? pyKeywords : lang.includes('js') ? jsKeywords : cppKeywords;
    return keywords.includes(word);
  };

  return (
    <div className="font-mono text-sm leading-relaxed text-zinc-200">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
          return (
            <div key={lineIdx} className="flex gap-3 text-zinc-500 italic">
              <span className="select-none text-zinc-600 w-5 text-right font-mono text-xs shrink-0">{lineIdx + 1}</span>
              <span>{line}</span>
            </div>
          );
        }

        const tokens = line.split(/(\s+|"[^"]*"|'[^']*'|[(){}[\];,.<>:+=\-*/])/);
        return (
          <div key={lineIdx} className="flex gap-3">
            <span className="select-none text-zinc-600 w-5 text-right font-mono text-xs shrink-0">{lineIdx + 1}</span>
            <div className="flex-1 whitespace-pre">
              {tokens.map((token, tokIdx) => {
                if (isKeyword(token)) {
                  return <span key={tokIdx} className="text-cyan-400 font-bold">{token}</span>;
                }
                if (/^"[^"]*"$|^'[^']*'$/.test(token)) {
                  return <span key={tokIdx} className="text-emerald-300 font-medium">{token}</span>;
                }
                if (/^\d+$/.test(token)) {
                  return <span key={tokIdx} className="text-amber-400 font-medium">{token}</span>;
                }
                if (token.startsWith('#include') || (token.startsWith('<') && token.endsWith('>'))) {
                  return <span key={tokIdx} className="text-violet-400 font-medium">{token}</span>;
                }
                return <span key={tokIdx} className="text-zinc-200">{token}</span>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function VoiceAssistant() {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [activeAudioNode, setActiveAudioNode] = useState<AudioNode | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [selectedPersona, setSelectedPersona] = useState('concise');
  const [latency, setLatency] = useState<number | null>(42);
  const [subtitle, setSubtitle] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // States for voice-activated photo display & lightbox
  const [activePhoto, setActivePhoto] = useState<{ query: string; url: string } | null>(null);
  const [isFullscreenPhoto, setIsFullscreenPhoto] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  // State for voice-activated code execution
  const [activeCode, setActiveCode] = useState<{ language: string; code: string; output: string; badge?: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isRunningCode, setIsRunningCode] = useState<boolean>(false);
  const [isEditingCode, setIsEditingCode] = useState<boolean>(false);
  const [selectedLang, setSelectedLang] = useState<string>("C");
  const [stdinInput, setStdinInput] = useState<string>("");
  const [showStdin, setShowStdin] = useState<boolean>(false);

  useEffect(() => {
    if (activeCode) {
      Prism.highlightAll();
    }
  }, [activeCode, isEditingCode]);

  const handleRerunCode = () => {
    if (!activeCode) return;
    setIsRunningCode(true);

    // Safety timeout fallback so button never stays stuck even if server disconnects
    setTimeout(() => {
      setIsRunningCode(false);
    }, 3000);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'RE_RUN_CODE',
          language: selectedLang.toLowerCase(),
          code: activeCode.code,
          stdin: stdinInput,
        })
      );
    }
  };

  // States for Vision (Webcam & Screen Sharing)
  const [videoSource, setVideoSource] = useState<'none' | 'webcam' | 'screen'>('none');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const isMutedRef = useRef(isMuted);

  // Vision Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Reset imageLoaded whenever activePhoto URL changes
  useEffect(() => {
    setImageLoaded(false);
  }, [activePhoto?.url]);

  // Escape key handler for fullscreen lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreenPhoto(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real-time 1 FPS Video Frame Capture Loop for Vision
  useEffect(() => {
    if (videoSource === 'none' || !isConnected || !videoStreamRef.current) {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    frameIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const ws = wsRef.current;
      if (!video || !ws || ws.readyState !== WebSocket.OPEN || video.readyState < 2 || !ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      const base64Data = dataUrl.split(',')[1];

      ws.send(
        JSON.stringify({
          type: 'VIDEO_FRAME',
          data: base64Data,
        })
      );
    }, 1000);

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
  }, [videoSource, isConnected]);

  // Real-time audio visualizer hook
  const { volume } = useAudioVisualizer(activeAudioNode);

  const stopVideo = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoSource('none');
  };

  const toggleWebcam = async () => {
    if (videoSource === 'webcam') {
      stopVideo();
      return;
    }

    stopVideo();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setVideoSource('webcam');
    } catch (err) {
      console.error('Error accessing webcam:', err);
    }
  };

  const toggleScreenShare = async () => {
    if (videoSource === 'screen') {
      stopVideo();
      return;
    }

    stopVideo();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Handle screen share stop from browser native UI
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopVideo();
        };
      }

      setVideoSource('screen');
    } catch (err) {
      console.error('Error accessing screen share:', err);
    }
  };

  const startSession = async () => {
    try {
      // 1. Request microphone immediately inside click handler (user gesture)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      micStreamRef.current = stream;

      // 2. Initialize AudioContext and ensure it is resumed
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      audioContextRef.current = audioCtx;
      nextPlayTimeRef.current = audioCtx.currentTime;

      const outputGain = audioCtx.createGain();
      outputGain.connect(audioCtx.destination);
      outputGainRef.current = outputGain;

      // 3. Connect MediaStreamSource and ScriptProcessor
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      micSourceNodeRef.current = sourceNode;
      setActiveAudioNode(sourceNode);

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBuffer = floatTo16BitPCM(inputData, audioCtx.sampleRate);

        console.log('[Mic] Streaming audio chunk...', pcmBuffer.byteLength);
        wsRef.current.send(pcmBuffer);
      };

      sourceNode.connect(processor);
      processor.connect(audioCtx.destination);

      // 4. Open WebSocket connection to proxy server
      const currentPersona = PERSONAS.find((p) => p.id === selectedPersona)?.prompt || PERSONAS[0].prompt;
      const wsUrl = `ws://localhost:8080?voice=${encodeURIComponent(selectedVoice)}&persona=${encodeURIComponent(
        currentPersona
      )}`;

      const startTime = Date.now();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setStatus('listening');
        setLatency(Date.now() - startTime);
      };

    let currentTurnText = '';

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Handle tool call event from server to show photo
        if (msg.type === 'SHOW_PHOTO') {
          console.log('Received photo to display:', msg.imageUrl);
          setActivePhoto({ query: msg.query, url: msg.imageUrl });
          return;
        }

        // Handle incoming audio chunk messages from server
        if (msg.type === 'AUDIO_CHUNK' || msg.audio) {
          const audioData = msg.data || msg.audio;
          if (audioData && audioContextRef.current) {
            const audioCtx = audioContextRef.current;
            if (audioCtx.state === 'suspended') {
              await audioCtx.resume();
            }
            const pcm16 = base64ToUint8Array(audioData);
            const buffer = pcm24kToAudioBuffer(pcm16, audioCtx);

            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outputGainRef.current || audioCtx.destination);

            const playTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
            source.start(playTime);
            nextPlayTimeRef.current = playTime + buffer.duration;

            setStatus('speaking');
            if (outputGainRef.current) {
              setActiveAudioNode(outputGainRef.current);
            }
          }
          return;
        }

        // Handle tool call event from server for live code execution
        if (msg.type === 'CODE_EXECUTION' || msg.type === 'RE_RUN_RESULT' || msg.type === 'ERROR') {
          console.log('Received code execution result:', msg);
          setIsRunningCode(false);

          const codeStr = msg.code || '';
          let detectedLang = (msg.language || 'C').toUpperCase();

          if (codeStr.includes('#include <stdio.h>') && !codeStr.includes('<iostream>')) {
            detectedLang = 'C';
          } else if (codeStr.includes('#include <iostream>') || codeStr.includes('std::')) {
            detectedLang = 'CPP';
          } else if (codeStr.includes('public class') || codeStr.includes('System.out.println')) {
            detectedLang = 'JAVA';
          }

          setSelectedLang(detectedLang);

          const cleanOutput = (msg.output || '').replace(/\\n/g, '\n');

          if (msg.output !== undefined || msg.code !== undefined) {
            setActiveCode({
              language: detectedLang,
              code: msg.code || '',
              output: cleanOutput,
              badge: msg.badge || '● Exit 0 | Compiled locally',
            });
          }

          const formattedCodeText = `Executed ${msg.language || 'Code'}:\n\`\`\`${(msg.language || 'text').toLowerCase()}\n${msg.code || ''}\n\`\`\`\nOutput:\n\`\`\`\n${msg.output || 'Program executed successfully.'}\n\`\`\``;
          const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          setTranscript((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              sender: 'assistant',
              text: formattedCodeText,
              timestamp,
            },
          ]);
          return;
        }

        if (msg.type === 'TURN_COMPLETE') {
          return;
        }

        if (msg.serverContent?.interrupted) {
          nextPlayTimeRef.current = audioCtx.currentTime;
          setStatus('listening');
          if (micSourceNodeRef.current) {
            setActiveAudioNode(micSourceNodeRef.current);
          }
          return;
        }

        const parts = msg.serverContent?.modelTurn?.parts;
        if (parts) {
          setStatus('speaking');
          if (outputGainRef.current) {
            setActiveAudioNode(outputGainRef.current);
          }

          for (const part of parts) {
            if (part.text) {
              const rawText = part.text.trim();
              // Filter out internal thinking/model thoughts starting with **Interpreting or **
              if (
                !rawText.startsWith('**Interpreting') &&
                !rawText.startsWith('**Thinking') &&
                !rawText.startsWith('**') &&
                !rawText.toLowerCase().includes('internal thinking')
              ) {
                currentTurnText += part.text + ' ';
                setSubtitle(currentTurnText.trim());
              }
            }

            if (
              part.inlineData &&
              part.inlineData.data &&
              (part.inlineData.mimeType === 'audio/pcm;rate=24000' || part.inlineData.mimeType?.startsWith('audio/pcm'))
            ) {
              if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
              }

              if (!currentTurnText) {
                setSubtitle('Assistant is responding in audio stream...');
              }

              const rawBytes = base64ToUint8Array(part.inlineData.data);
              const buffer = pcm24kToAudioBuffer(rawBytes, audioCtx);

              const source = audioCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputGainRef.current || audioCtx.destination);

              const playTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
              source.start(playTime);
              nextPlayTimeRef.current = playTime + buffer.duration;
            }
          }
        }

        if (msg.serverContent?.turnComplete) {
          setStatus('listening');
          if (micSourceNodeRef.current) {
            setActiveAudioNode(micSourceNodeRef.current);
          }

          const turnText = currentTurnText.trim() || 'Audio response completed.';
          setTranscript((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              sender: 'assistant',
              text: turnText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);

          currentTurnText = '';
        }
      } catch (err) {
        // Non-JSON or binary data frame handling
      }
    };

    ws.onclose = () => cleanup();
    ws.onerror = (err) => console.error('WebSocket error:', err);
    } catch (err) {
      console.error('Error accessing microphone or initializing audio session:', err);
      cleanup();
    }
  };

  const cleanup = () => {
    setIsConnected(false);
    setStatus('idle');
    setActiveAudioNode(null);
    setSubtitle('');
    setActivePhoto(null);
    setIsFullscreenPhoto(false);
    stopVideo();

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    micSourceNodeRef.current = null;
    outputGainRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const saveTranscript = () => {
    if (transcript.length === 0) return;
    const formatted = transcript
      .map((m) => `[${m.timestamp}] ${m.sender.toUpperCase()}: ${m.text}`)
      .join('\n\n');
    const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-assistant-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearSession = () => {
    setTranscript([]);
    setSubtitle('');
    setActivePhoto(null);
    setIsFullscreenPhoto(false);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#05070e] text-zinc-100 font-sans selection:bg-cyan-500/30 relative min-h-screen">
      {/* Main Voice Center Stage */}
      <main className="flex-1 flex flex-col items-center justify-between p-4 sm:p-6 transition-all duration-300 relative overflow-y-auto w-full">
      {/* Background Ambient Glowing Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[380px] bg-cyan-500/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-10 w-[400px] h-[400px] bg-violet-600/10 blur-[120px] pointer-events-none rounded-full" />

      {/* Top Header Glassmorphic Bar */}
      <header className="relative z-20 w-full max-w-5xl px-4 sm:px-6 pt-5">
        <div className="flex items-center justify-between backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] px-5 py-3.5 rounded-2xl shadow-2xl">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-inner">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 003-3V4.5a3 3 0 10-6 0v8.25a3 3 0 003 3z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">Realtime Voice Assistant</h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Gemini 2.5 Native Audio + Vision
                </span>
              </div>
              <p className="text-xs text-slate-400">Production Multimodal Voice & Vision Interface</p>
            </div>
          </div>

          {/* Right Header Status & Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Latency & Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white/[0.04] border border-white/[0.08]">
              {latency && (
                <span className="hidden md:inline-block text-slate-400 border-r border-white/10 pr-2">
                  Ping: <strong className="text-slate-200">{latency}ms</strong>
                </span>
              )}
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]' : 'bg-slate-500'
                  }`}
                />
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>



            {/* History Toggle Button */}
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`p-2.5 rounded-xl border transition-all ${
                isHistoryOpen
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
              }`}
              title="Conversation History"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Settings Toggle Button */}
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-2.5 rounded-xl border transition-all ${
                isSettingsOpen
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
              }`}
              title="Voice & Model Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 18H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 12h11.25"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Floating Glassmorphic PiP Video Preview */}
      <div
        className={`fixed bottom-24 right-6 z-30 transition-all duration-300 ${
          videoSource !== 'none' ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'
        }`}
      >
        <div className="relative w-48 sm:w-56 h-32 sm:h-36 rounded-2xl overflow-hidden backdrop-blur-xl bg-white/[0.05] border border-white/[0.12] shadow-2xl group">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {/* Live Stream Indicator Badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 backdrop-blur-md text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{videoSource === 'webcam' ? 'Webcam 1 FPS' : 'Screen Share 1 FPS'}</span>
          </div>
          {/* Close Button */}
          <button
            onClick={stopVideo}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition opacity-0 group-hover:opacity-100"
            title="Stop Video Stream"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-4">
        {/* Center Stage: Interactive Voice Orb & Live Subtitle */}
        <section className="flex flex-col items-center justify-center w-full max-w-2xl text-center">
          {/* Voice Orb Component with Breathing Neon Glow Ring */}
          <div className="relative p-4 rounded-full shadow-[0_0_80px_rgba(6,182,212,0.35)] transition-all">
            <VoiceOrb status={status} volume={volume} />
          </div>

          {/* Active Listening Transcription Pill */}
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <span className={`w-2 h-2 rounded-full ${status === 'listening' ? 'bg-cyan-400 animate-ping' : status === 'speaking' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span className="font-mono tracking-tight text-[11px] uppercase">
              {status === 'listening' ? 'MIC ACTIVE • LISTENING...' : status === 'speaking' ? 'GEMINI VOICE STREAM' : 'SYSTEM READY'}
            </span>
          </div>

          {/* Status Badge & Live Subtitle Bar */}
          <div className="mt-4 w-full flex flex-col items-center gap-3">
            {/* Persona Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/[0.03] border border-white/[0.08] text-slate-400">
              <span>Persona:</span>
              <span className="text-cyan-400 font-semibold">
                {PERSONAS.find((p) => p.id === selectedPersona)?.label}
              </span>
            </div>

            {/* Live Streaming Subtitle Box */}
            <div className="w-full min-h-[56px] max-w-lg flex items-center justify-center px-6 py-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] shadow-inner transition-all">
              {subtitle ? (
                <p className="text-sm font-medium text-slate-200 leading-relaxed">{subtitle}</p>
              ) : (
                <p className="text-xs text-slate-500 font-normal italic">
                  {status === 'listening'
                    ? 'Listening... Speak into your microphone'
                    : status === 'speaking'
                    ? 'Gemini is responding...'
                    : 'Click "Start Session" to begin conversation'}
                </p>
              )}
            </div>
          </div>

          {/* Voice-Activated Floating Photo Card */}
          {activePhoto && (
            <div className="mt-6 w-full max-w-md backdrop-blur-xl bg-white/[0.04] border border-white/[0.12] p-4 rounded-2xl shadow-2xl transition-all">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                      />
                    </svg>
                  </span>
                  <div className="text-left">
                    <h3 className="text-xs font-bold text-white capitalize">{activePhoto.query}</h3>
                    <p className="text-[10px] text-slate-400">Voice Tool Response</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActivePhoto(null);
                    setIsFullscreenPhoto(false);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                  title="Dismiss image"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Image Preview Container */}
              <div
                onClick={() => setIsFullscreenPhoto(true)}
                className="relative cursor-pointer group overflow-hidden rounded-xl border border-white/10 hover:border-emerald-500/50 transition-all duration-300 shadow-xl"
              >
                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center gap-2 text-white font-medium text-sm">
                  <span>🔍 Click for Fullscreen</span>
                </div>

                {!imageLoaded && (
                  <div className="w-full h-64 flex flex-col items-center justify-center bg-neutral-900/80 animate-pulse text-neutral-400 text-sm">
                    <span>Loading {activePhoto.query}...</span>
                  </div>
                )}

                <img
                  src={activePhoto.url}
                  alt={activePhoto.query}
                  loading="eager"
                  onLoad={() => setImageLoaded(true)}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://loremflickr.com/800/600/${encodeURIComponent(
                      activePhoto.query
                    )}`;
                    setImageLoaded(true);
                  }}
                  className={`w-full h-64 object-cover transition-opacity duration-300 ${
                    imageLoaded ? 'opacity-100' : 'opacity-0 absolute'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Voice-Activated Live Code Execution Terminal Card */}
          {activeCode && (
            <div className="mt-6 w-full max-w-xl bg-zinc-950/80 backdrop-blur-2xl border border-zinc-800/80 rounded-2xl shadow-2xl shadow-cyan-950/20 overflow-hidden text-left transition-all">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-b border-zinc-800/80">
                {/* Left: macOS Window Controls */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-sm" />
                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-sm" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm" />
                  </div>
                </div>

                {/* Center: Glowing Language Badge & Selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedLang.toUpperCase()}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      setSelectedLang(newLang);
                      setActiveCode((prev) => (prev ? { ...prev, language: newLang } : null));
                    }}
                    className="bg-zinc-900/90 text-cyan-400 text-xs font-mono px-2.5 py-1 rounded-md border border-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
                  >
                    <option value="C">C</option>
                    <option value="CPP">C++</option>
                    <option value="PYTHON">Python</option>
                    <option value="JAVASCRIPT">JavaScript</option>
                    <option value="TYPESCRIPT">TypeScript</option>
                    <option value="JAVA">Java</option>
                    <option value="GO">Go</option>
                    <option value="RUST">Rust</option>
                  </select>

                  <button
                    onClick={() => setShowStdin(!showStdin)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer font-medium ${
                      showStdin
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                        : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-white"
                    }`}
                  >
                    Custom Input
                  </button>
                  <span className="text-xs font-medium text-zinc-400 hidden sm:inline-block font-mono">Live Execution Sandbox</span>
                </div>

                {/* Right: Sleek Dark Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRerunCode}
                    disabled={isRunningCode}
                    className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1.5 rounded-lg transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)] active:scale-95 cursor-pointer disabled:opacity-50 font-semibold"
                    title="Re-run code locally in sandbox"
                  >
                    <svg className={`w-3.5 h-3.5 ${isRunningCode ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    <span>{isRunningCode ? 'Running...' : '▶ Run'}</span>
                  </button>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeCode.code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="flex items-center gap-1.5 bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer font-medium"
                    title="Copy source code to clipboard"
                  >
                    {copiedCode ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-emerald-400 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span className="text-emerald-400 font-semibold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 011.927-.184" />
                        </svg>
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveCode(null)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition"
                    title="Dismiss terminal"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Code Body Container */}
              <div className="p-4 space-y-3">
                <div className="font-mono text-sm leading-relaxed text-zinc-200">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1.5 font-mono">
                    <span>Source Code ({activeCode.language})</span>
                    <button
                      onClick={() => setIsEditingCode(!isEditingCode)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer font-sans"
                    >
                      {isEditingCode ? '👁️ View Highlighted' : '✏️ Edit Code'}
                    </button>
                  </div>

                  {isEditingCode ? (
                    <textarea
                      value={activeCode.code}
                      onChange={(e) => {
                        const newCode = e.target.value;
                        setActiveCode((prev) => (prev ? { ...prev, code: newCode } : null));
                      }}
                      rows={Math.min(15, Math.max(5, activeCode.code.split('\n').length + 1))}
                      className="w-full bg-[#070913] text-zinc-200 p-4 rounded-xl border border-cyan-500/40 font-mono text-sm leading-relaxed outline-none focus:ring-1 focus:ring-cyan-500 shadow-inner resize-y"
                      spellCheck={false}
                    />
                  ) : (
                    <div
                      onClick={() => setIsEditingCode(true)}
                      className="bg-[#0a0d18]/90 p-4 rounded-xl border border-zinc-900 overflow-x-auto max-h-60 cursor-pointer hover:border-zinc-800 transition"
                      title="Click to edit code"
                    >
                      <pre className="!bg-transparent !m-0 !p-0 font-mono text-sm leading-relaxed text-zinc-200">
                        <code
                          className={`language-${
                            activeCode.language.toLowerCase().includes('cpp') || activeCode.language.toLowerCase().includes('c++')
                              ? 'cpp'
                              : activeCode.language.toLowerCase().includes('py')
                              ? 'python'
                              : activeCode.language.toLowerCase().includes('ts') || activeCode.language.toLowerCase().includes('typescript')
                              ? 'typescript'
                              : activeCode.language.toLowerCase().includes('js') || activeCode.language.toLowerCase().includes('javascript')
                              ? 'javascript'
                              : activeCode.language.toLowerCase().includes('java')
                              ? 'java'
                              : activeCode.language.toLowerCase().includes('go')
                              ? 'go'
                              : activeCode.language.toLowerCase().includes('rust') || activeCode.language.toLowerCase().includes('rs')
                              ? 'rust'
                              : 'c'
                          }`}
                        >
                          {activeCode.code}
                        </code>
                      </pre>
                    </div>
                  )}
                </div>

                {/* Optional STDIN Input Box */}
                {showStdin && (
                  <div className="mt-2">
                    <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                      Program Input (STDIN)
                    </label>
                    <textarea
                      rows={2}
                      value={stdinInput}
                      onChange={(e) => setStdinInput(e.target.value)}
                      placeholder="Enter input for scanf, cin, or input() (e.g. 10 20)..."
                      className="w-full bg-black/70 border border-zinc-800 rounded-lg p-2 font-mono text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50 resize-none"
                    />
                  </div>
                )}

                {/* Output Console Box */}
                <div className="bg-black/90 border border-zinc-800/80 rounded-xl p-3 font-mono text-xs text-emerald-400 shadow-inner">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono mb-2 pb-1.5 border-b border-zinc-800/80">
                    <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                      <span className="text-cyan-400">❯</span> output:
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {activeCode.badge || '● Exit 0 | Compiled locally'}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap">{activeCode.output}</pre>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Fullscreen Lightbox Modal */}
        {isFullscreenPhoto && activePhoto && (
          <div
            onClick={() => setIsFullscreenPhoto(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 sm:p-8 animate-in fade-in duration-200"
          >
            {/* Close Button Top Right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreenPhoto(false);
              }}
              className="absolute top-5 right-5 z-50 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg"
              title="Close fullscreen view (Esc)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Fullscreen Image */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-[90vw] flex flex-col items-center justify-center"
            >
              <img
                src={activePhoto.url}
                alt={activePhoto.query}
                className="max-h-[82vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl transition-transform duration-300 hover:scale-[1.01]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://loremflickr.com/800/600/${encodeURIComponent(
                    activePhoto.query
                  )}`;
                }}
              />

              {/* Floating Title & Action Bar */}
              <div className="mt-4 flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl">
                <span className="text-xs font-semibold capitalize">{activePhoto.query}</span>
                <a
                  href={activePhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 border-l border-white/20 pl-3 transition"
                >
                  <span>Open Original</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Right Expandable Conversation History Drawer */}
        {isHistoryOpen && (
          <aside className="fixed inset-y-0 right-0 z-30 w-full sm:w-96 bg-[#0d1322]/95 backdrop-blur-2xl border-l border-white/[0.1] shadow-2xl flex flex-col transition-all duration-300">
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Conversation History</h2>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-cyan-500/20 text-cyan-300 font-semibold">
                  {transcript.length}
                </span>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Transcript Messages List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {transcript.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs">
                  <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.016-.944 6.754 6.754 0 001.328-3.033c-.779-.909-1.222-2.072-1.222-3.243 0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                  No messages recorded in this session yet.
                </div>
              ) : (
                transcript.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-2xl text-xs space-y-1.5 border ${
                      msg.sender === 'assistant'
                        ? 'bg-cyan-500/10 border-cyan-500/20 text-slate-200'
                        : 'bg-white/[0.04] border-white/[0.08] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                      <span className={msg.sender === 'assistant' ? 'text-cyan-400' : 'text-blue-400'}>
                        {msg.sender === 'assistant' ? 'Gemini Assistant' : 'User'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                        <button
                          onClick={() => copyToClipboard(msg.id, msg.text)}
                          className="hover:text-white transition"
                          title="Copy text"
                        >
                          {copiedId === msg.id ? (
                            <span className="text-emerald-400 text-[10px]">Copied!</span>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 011.927-.184" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                ))
              )}
            </div>

            {/* History Footer Action Bar */}
            <div className="p-4 border-t border-white/[0.08] flex items-center justify-between gap-2">
              <button
                onClick={clearSession}
                className="flex-1 py-2 text-xs font-semibold rounded-xl bg-white/[0.05] hover:bg-white/10 text-slate-300 transition"
              >
                Clear History
              </button>
              <button
                onClick={saveTranscript}
                className="flex-1 py-2 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white transition shadow-sm"
              >
                Save Transcript
              </button>
            </div>
          </aside>
        )}

        {/* Settings Drawer / Modal */}
        {isSettingsOpen && (
          <aside className="fixed inset-y-0 right-0 z-30 w-full sm:w-96 bg-[#0d1322]/95 backdrop-blur-2xl border-l border-white/[0.1] shadow-2xl flex flex-col transition-all duration-300">
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <h2 className="text-sm font-bold text-white tracking-wide">Voice & Model Settings</h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Voice Model Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Gemini Voice Persona</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id} className="bg-slate-900 text-slate-200">
                      {v.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">Changes take effect on the next session start.</p>
              </div>

              {/* Persona Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Assistant System Instruction</label>
                <div className="space-y-2">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersona(p.id)}
                      className={`w-full p-3 rounded-xl border text-left transition ${
                        selectedPersona === p.id
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                          : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-200">{p.label}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{p.prompt}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Voice Control Panel & Vision Controls */}
      <footer className="relative z-20 w-full max-w-4xl px-4 pb-6 flex flex-col items-center gap-4">
        {/* Persona Quick Selector Chips */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPersona(p.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                selectedPersona === p.id
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                  : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:border-cyan-500/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Main Controls Pill Bar */}
        <div className="w-full max-w-lg p-2 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-2xl flex items-center justify-between gap-2">
          {/* Mic Mute / Unmute Quick Toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            disabled={!isConnected}
            className={`p-3 rounded-full transition-all flex items-center justify-center ${
              !isConnected
                ? 'opacity-40 cursor-not-allowed text-slate-500'
                : isMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-white/[0.06] hover:bg-white/[0.1] text-slate-200'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.41 0-.75-.34-.75-.75V9.75c0-.41.34-.75.75-.75h2.24z"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 003-3V4.5a3 3 0 10-6 0v8.25a3 3 0 003 3z"
                />
              </svg>
            )}
          </button>

          {/* Webcam Vision Toggle Button */}
          <button
            onClick={toggleWebcam}
            disabled={!isConnected}
            className={`p-3 rounded-full border transition-all flex items-center justify-center ${
              !isConnected
                ? 'opacity-40 cursor-not-allowed text-slate-500 border-transparent'
                : videoSource === 'webcam'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.08] text-slate-200'
            }`}
            title={videoSource === 'webcam' ? 'Stop Webcam Vision' : 'Start Webcam Vision (1 FPS)'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </button>

          {/* Screen Share Vision Toggle Button */}
          <button
            onClick={toggleScreenShare}
            disabled={!isConnected}
            className={`p-3 rounded-full border transition-all flex items-center justify-center ${
              !isConnected
                ? 'opacity-40 cursor-not-allowed text-slate-500 border-transparent'
                : videoSource === 'screen'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                : 'bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.08] text-slate-200'
            }`}
            title={videoSource === 'screen' ? 'Stop Screen Share Vision' : 'Start Screen Share Vision (1 FPS)'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v1.5H3v-1.5"
              />
            </svg>
          </button>

          {/* Primary Action Button: Start / Stop Session */}
          <button
            onClick={isConnected ? cleanup : startSession}
            className={`flex-1 py-3 px-5 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-lg active:scale-95 ${
              isConnected
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25'
            }`}
          >
            {isConnected ? (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span>End Session</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                  />
                </svg>
                <span>Start Session</span>
              </>
            )}
          </button>

          {/* Voice Dropdown Quick Picker */}
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="px-3 py-2.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-cyan-300 focus:outline-none cursor-pointer"
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id} className="bg-slate-900 text-slate-200">
                {v.id}
              </option>
            ))}
          </select>
        </div>
      </footer>
    </main>


  </div>
);
}
