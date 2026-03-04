export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private onAudioData: ((data: Int16Array) => void) | null = null;
  private _isRecording = false;

  private static readonly TARGET_SAMPLE_RATE = 16000;

  get isRecording(): boolean {
    return this._isRecording;
  }

  async start(onData: (data: Int16Array) => void): Promise<void> {
    if (this._isRecording) return;

    this.onAudioData = onData;

    // 获取麦克风权限
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 使用系统默认采样率（Windows 下强制 16kHz 会导致静音）
    this.audioContext = new AudioContext();
    const nativeSampleRate = this.audioContext.sampleRate;
    console.log(`[AudioCapture] 系统采样率: ${nativeSampleRate}Hz, 目标: ${AudioCapture.TARGET_SAMPLE_RATE}Hz`);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // ScriptProcessorNode: 4096 samples 缓冲
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this._isRecording) return;

      const float32Data = event.inputBuffer.getChannelData(0);

      // 如果系统采样率不是 16kHz，需要重采样
      const resampled = nativeSampleRate === AudioCapture.TARGET_SAMPLE_RATE
        ? float32Data
        : this.resample(float32Data, nativeSampleRate, AudioCapture.TARGET_SAMPLE_RATE);

      // Float32 [-1.0, 1.0] → Int16 [-32768, 32767]
      const int16Data = new Int16Array(resampled.length);
      for (let i = 0; i < resampled.length; i++) {
        const s = Math.max(-1, Math.min(1, resampled[i]));
        int16Data[i] = s < 0 ? s * 32768 : s * 32767;
      }
      this.onAudioData?.(int16Data);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
    this._isRecording = true;
  }

  stop(): void {
    this._isRecording = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.onAudioData = null;
  }

  /** 线性插值重采样 */
  private resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    const ratio = fromRate / toRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const floor = Math.floor(srcIndex);
      const frac = srcIndex - floor;

      if (floor + 1 < input.length) {
        output[i] = input[floor] * (1 - frac) + input[floor + 1] * frac;
      } else {
        output[i] = input[Math.min(floor, input.length - 1)];
      }
    }

    return output;
  }
}
