export function floatTo16BitPCM(input: Float32Array, inputSampleRate: number): ArrayBuffer {
  const targetSampleRate = 16000;
  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const result = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const originalIndex = Math.floor(i * ratio);
    let sample = input[originalIndex];
    sample = Math.max(-1, Math.min(1, sample));
    result[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return result.buffer;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function pcm24kToAudioBuffer(
  rawBytes: Uint8Array,
  audioCtx: AudioContext
): AudioBuffer {
  const int16 = new Int16Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength / 2);
  const float32 = new Float32Array(int16.length);

  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }

  const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
  audioBuffer.copyToChannel(float32, 0);
  return audioBuffer;
}
