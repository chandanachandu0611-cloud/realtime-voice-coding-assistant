// Gemini Realtime Voice Assistant - Client Application

let socket = null;
let isConnected = false;
let isRecording = false;

// Audio Contexts
let micAudioContext = null;
let micStream = null;
let scriptProcessor = null;
let micAnalyser = null;

let playbackAudioContext = null;
let playbackAnalyser = null;
let nextStartTime = 0;
let activeAudioSources = [];

// DOM Elements
const toggleSessionBtn = document.getElementById('toggleSessionBtn');
const toggleSessionText = document.getElementById('toggleSessionText');
const interruptBtn = document.getElementById('interruptBtn');
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const voiceSelect = document.getElementById('voiceSelect');
const systemInstructionInput = document.getElementById('systemInstruction');
const transcriptFeed = document.getElementById('transcriptFeed');
const emptyState = document.getElementById('emptyState');
const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
const visualizerCanvas = document.getElementById('visualizerCanvas');
const visualizerSubtext = document.getElementById('visualizerSubtext');
const micLevelText = document.getElementById('micLevelText');
const bufferCountText = document.getElementById('bufferCountText');
const modeBadge = document.getElementById('modeBadge');

// Canvas setup
const canvasCtx = visualizerCanvas.getContext('2d');
let animationFrameId = null;

// Presets
const presets = {
  friendly: "You are a warm, helpful, and conversational AI voice assistant. Keep answers concise, natural, and engaging for spoken conversation.",
  mentor: "You are an expert software mentor. Provide insightful, encouraging guidance and explanations concise enough for voice interaction.",
  concise: "You are an ultra-concise assistant. Give brief 1-2 sentence direct answers suitable for quick voice updates.",
  sarcastic: "You are a witty, mildly sarcastic AI assistant. Keep responses playful, clever, and brief."
};

// Preset Button Handler
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-preset');
    if (presets[key]) {
      systemInstructionInput.value = presets[key];
    }
  });
});

// Clear transcript
clearTranscriptBtn.addEventListener('click', () => {
  transcriptFeed.innerHTML = '';
  transcriptFeed.appendChild(emptyState);
  emptyState.style.display = 'flex';
});

// Toggle Session Handler
toggleSessionBtn.addEventListener('click', async () => {
  if (!isConnected) {
    await startSession();
  } else {
    stopSession();
  }
});

// Interrupt Button Handler
interruptBtn.addEventListener('click', () => {
  interruptAssistantSpeech();
});

// Start Session
async function startSession() {
  updateStatus('connecting', 'Connecting...');
  toggleSessionBtn.disabled = true;

  try {
    // 1. Initialize Microhone Stream
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // 2. Initialize Audio Playback Context
    playbackAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    playbackAnalyser = playbackAudioContext.createAnalyser();
    playbackAnalyser.fftSize = 256;

    // 3. Connect to WebSocket Proxy
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Client] Connected to proxy server WebSocket.');
      sendInitialSetup();
      startMicRecording();
      
      isConnected = true;
      toggleSessionBtn.disabled = false;
      toggleSessionBtn.classList.remove('start-btn');
      toggleSessionBtn.classList.add('stop-btn');
      toggleSessionText.textContent = 'End Session';
      interruptBtn.disabled = false;

      updateStatus('live', 'Live (Listening)');
      visualizerSubtext.textContent = 'Gemini is listening... Speak into your mic';
      startVisualizer();
    };

    socket.onmessage = (event) => {
      handleServerMessage(event.data);
    };

    socket.onerror = (err) => {
      console.error('[Client] WebSocket error:', err);
      updateStatus('error', 'Connection Error');
    };

    socket.onclose = () => {
      console.log('[Client] WebSocket connection closed.');
      stopSession();
    };

  } catch (err) {
    console.error('[Client] Could not start session:', err);
    alert('Microphone access or network connection failed: ' + err.message);
    updateStatus('disconnected', 'Disconnected');
    toggleSessionBtn.disabled = false;
  }
}

// Send Initial Setup Frame to Gemini
function sendInitialSetup() {
  const selectedVoice = voiceSelect.value || 'Puck';
  const systemPrompt = systemInstructionInput.value.trim() || presets.friendly;

  const setupMsg = {
    setup: {
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: selectedVoice
            }
          }
        }
      },
      systemInstruction: {
        parts: [
          { text: systemPrompt }
        ]
      }
    }
  };

  console.log('[Client] Sending setup message:', setupMsg);
  socket.send(JSON.stringify(setupMsg));
}

// Start Microphone Audio Recording & Processing
function startMicRecording() {
  micAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const micSource = micAudioContext.createMediaStreamSource(micStream);
  
  micAnalyser = micAudioContext.createAnalyser();
  micAnalyser.fftSize = 256;
  micSource.connect(micAnalyser);

  // Script processor for PCM chunk extraction (buffer size 4096 = ~256ms chunk)
  scriptProcessor = micAudioContext.createScriptProcessor(4096, 1, 1);
  
  scriptProcessor.onaudioprocess = (e) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const inputData = e.inputBuffer.getChannelData(0);
    const pcm16 = convertFloat32ToInt16(inputData);
    const base64Audio = arrayBufferToBase64(pcm16.buffer);

    const audioMsg = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm",
            data: base64Audio
          }
        ]
      }
    };

    socket.send(JSON.stringify(audioMsg));
  };

  micSource.connect(scriptProcessor);
  scriptProcessor.connect(micAudioContext.destination);
  isRecording = true;
}

// Handle Messages from Server
function handleServerMessage(data) {
  try {
    const msg = JSON.parse(data);
    
    if (msg.error) {
      console.error('[Gemini Server Error]', msg.error);
      appendTranscript('assistant', `⚠️ ${msg.error}`);
      updateStatus('error', 'API Error');
      return;
    }

    if (msg.serverContent) {
      const { modelTurn, turnComplete, interrupted } = msg.serverContent;

      if (interrupted) {
        console.log('[Client] Model turn was interrupted');
        interruptAssistantSpeech();
      }

      if (modelTurn && modelTurn.parts) {
        for (const part of modelTurn.parts) {
          // Audio Part
          if (part.inlineData && part.inlineData.data) {
            updateStatus('speaking', 'Gemini Speaking...');
            const pcmBase64 = part.inlineData.data;
            playAudioChunk(pcmBase64);
          }
          // Text Part (if text modality included or transcript provided)
          if (part.text) {
            appendTranscript('assistant', part.text);
          }
        }
      }

      if (turnComplete) {
        console.log('[Client] Turn complete');
        setTimeout(() => {
          if (activeAudioSources.length === 0) {
            updateStatus('live', 'Live (Listening)');
            visualizerSubtext.textContent = 'Gemini is listening... Speak into your mic';
          }
        }, 500);
      }
    }
  } catch (err) {
    console.error('[Client] Failed to parse server message:', err);
  }
}

// Play Received 24kHz Base64 PCM Audio Chunk
function playAudioChunk(base64Pcm) {
  if (!playbackAudioContext) return;

  const arrayBuffer = base64ToArrayBuffer(base64Pcm);
  const int16Array = new Int16Array(arrayBuffer);
  const float32Array = new Float32Array(int16Array.length);

  // Convert 16-bit signed PCM to 32-bit float [-1.0, 1.0]
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768;
  }

  // Create AudioBuffer at 24kHz
  const audioBuffer = playbackAudioContext.createBuffer(1, float32Array.length, 24000);
  audioBuffer.getChannelData(0).set(float32Array);

  const source = playbackAudioContext.createBufferSource();
  source.buffer = audioBuffer;

  // Connect to playback analyzer and destination
  source.connect(playbackAnalyser);
  playbackAnalyser.connect(playbackAudioContext.destination);

  const currentTime = playbackAudioContext.currentTime;
  if (nextStartTime < currentTime) {
    nextStartTime = currentTime;
  }

  source.start(nextStartTime);
  nextStartTime += audioBuffer.duration;

  activeAudioSources.push(source);
  bufferCountText.textContent = activeAudioSources.length;

  source.onended = () => {
    const idx = activeAudioSources.indexOf(source);
    if (idx !== -1) {
      activeAudioSources.splice(idx, 1);
    }
    bufferCountText.textContent = activeAudioSources.length;

    if (activeAudioSources.length === 0 && isConnected) {
      updateStatus('live', 'Live (Listening)');
      visualizerSubtext.textContent = 'Gemini is listening... Speak into your mic';
    }
  };
}

// Interrupt Assistant Speech Instantly
function interruptAssistantSpeech() {
  console.log('[Client] Interrupting audio output...');
  for (const src of activeAudioSources) {
    try {
      src.stop();
    } catch (e) {}
  }
  activeAudioSources = [];
  nextStartTime = 0;
  bufferCountText.textContent = '0';
  
  if (isConnected) {
    updateStatus('live', 'Live (Listening)');
    visualizerSubtext.textContent = 'Gemini is listening... Speak into your mic';
  }
}

// Append Speech Transcript Bubble
let currentAssistantBubble = null;

function appendTranscript(sender, text) {
  if (emptyState.style.display !== 'none') {
    emptyState.style.display = 'none';
  }

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${sender}`;

  const author = document.createElement('div');
  author.className = 'msg-author';
  author.textContent = sender === 'user' ? 'You' : 'Gemini';

  const content = document.createElement('div');
  content.className = 'msg-text';
  content.textContent = text;

  bubble.appendChild(author);
  bubble.appendChild(content);

  transcriptFeed.appendChild(bubble);
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

// Stop Session
function stopSession() {
  isConnected = false;
  isRecording = false;

  interruptAssistantSpeech();

  if (socket) {
    socket.close();
    socket = null;
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }

  if (micAudioContext) {
    micAudioContext.close();
    micAudioContext = null;
  }

  if (playbackAudioContext) {
    playbackAudioContext.close();
    playbackAudioContext = null;
  }

  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  toggleSessionBtn.disabled = false;
  toggleSessionBtn.classList.remove('stop-btn');
  toggleSessionBtn.classList.add('start-btn');
  toggleSessionText.textContent = 'Start Session';
  interruptBtn.disabled = true;

  updateStatus('disconnected', 'Disconnected');
  visualizerSubtext.textContent = 'Click "Start Session" to speak with Gemini';
  micLevelText.textContent = '0%';
  bufferCountText.textContent = '0';

  clearCanvas();
}

// Update Status Pill UI
function updateStatus(stateClass, label) {
  statusPill.className = `status-pill ${stateClass}`;
  statusText.textContent = label;
  document.body.className = stateClass;
}

// Audio Visualizer Renderer
function startVisualizer() {
  const resizeCanvas = () => {
    visualizerCanvas.width = visualizerCanvas.parentElement.clientWidth;
    visualizerCanvas.height = visualizerCanvas.parentElement.clientHeight;
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const bufferLength = 64;
  const micData = new Uint8Array(bufferLength);
  const playData = new Uint8Array(bufferLength);

  function draw() {
    animationFrameId = requestAnimationFrame(draw);

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;

    canvasCtx.clearRect(0, 0, width, height);

    let micVolume = 0;
    if (micAnalyser && isRecording) {
      micAnalyser.getByteFrequencyData(micData);
      let sum = 0;
      for (let i = 0; i < micData.length; i++) sum += micData[i];
      micVolume = sum / micData.length;
      micLevelText.textContent = `${Math.round((micVolume / 255) * 100)}%`;
    }

    let playVolume = 0;
    if (playbackAnalyser && activeAudioSources.length > 0) {
      playbackAnalyser.getByteFrequencyData(playData);
      let sum = 0;
      for (let i = 0; i < playData.length; i++) sum += playData[i];
      playVolume = sum / playData.length;
    }

    const activeVolume = Math.max(micVolume, playVolume);
    const activeData = playVolume > micVolume ? playData : micData;

    // Draw Smooth Waveform Spectrum
    canvasCtx.lineWidth = 3;
    const gradient = canvasCtx.createLinearGradient(0, 0, width, 0);
    
    if (playVolume > micVolume) {
      gradient.addColorStop(0, '#ec4899');
      gradient.addColorStop(0.5, '#8b5cf6');
      gradient.addColorStop(1, '#06b6d4');
    } else {
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(0.5, '#8b5cf6');
      gradient.addColorStop(1, '#ec4899');
    }

    canvasCtx.strokeStyle = gradient;
    canvasCtx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = activeData[i] / 128.0;
      const amplitude = (activeVolume / 128.0) * (height / 3);
      const y = (height / 2) + Math.sin(i * 0.2 + Date.now() * 0.005) * amplitude * (v * 0.5);

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
  }

  draw();
}

function clearCanvas() {
  if (canvasCtx && visualizerCanvas) {
    canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
  }
}

// Helpers
function convertFloat32ToInt16(buffer) {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) {
    const s = Math.max(-1, Math.min(1, buffer[l]));
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return buf;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
