export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private onAudioData: ((data: Int16Array) => void) | null = null;
  private _isRecording = false;

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
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 创建 AudioContext（16kHz 采样率匹配 SenseVoice 要求）
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // ScriptProcessorNode: 4096 samples / 16000 Hz = 256ms 间隔
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this._isRecording) return;

      const float32Data = event.inputBuffer.getChannelData(0);
      // Float32 [-1.0, 1.0] → Int16 [-32768, 32767]
      const int16Data = new Int16Array(float32Data.length);
      for (let i = 0; i < float32Data.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Data[i]));
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
}
