// Records the microphone as 16 kHz mono WAV.
// MediaRecorder gives different containers per browser (mp4 on iPhone, webm on
// Chrome); raw PCM -> WAV works the same everywhere and Gemini accepts it.

const TARGET_RATE = 16_000;

export type Recording = { base64: string; durationSec: number };

export class WavRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;
  onLevel: ((level: number) => void) | null = null;

  async start(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.context = new AudioContext();
    await this.context.resume();
    const source = this.context.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but, unlike AudioWorklet, needs no separate
    // module file and behaves consistently in iOS home-screen apps.
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      if (this.onLevel) {
        let sum = 0;
        for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
        this.onLevel(Math.min(1, Math.sqrt(sum / (data.length / 8)) * 4));
      }
    };
    source.connect(this.processor);
    this.processor.connect(this.context.destination);
    this.startedAt = performance.now();
  }

  async stop(): Promise<Recording> {
    const durationSec = (performance.now() - this.startedAt) / 1000;
    const sampleRate = this.context?.sampleRate ?? 48_000;
    this.release();

    const merged = merge(this.chunks);
    this.chunks = [];
    const samples = downsample(merged, sampleRate, TARGET_RATE);
    return { base64: toBase64(encodeWav(samples, TARGET_RATE)), durationSec };
  }

  cancel(): void {
    this.release();
    this.chunks = [];
  }

  // Releasing the mic after every answer matters on iPhone: while it is held,
  // speech playback is routed quietly through the earpiece.
  private release(): void {
    this.processor?.disconnect();
    this.processor = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
  }
}

function merge(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from <= to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    // Average the source window to avoid aliasing.
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
