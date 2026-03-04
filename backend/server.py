#!/usr/bin/env python3
"""
实时语音转写 WebSocket 后端服务
基于 sherpa-onnx + SenseVoice-Small + Silero VAD
"""

import argparse
import asyncio
import json
import signal
import sys
import time
from pathlib import Path

import numpy as np

try:
    import sherpa_onnx
except ImportError:
    print("错误: 请先安装 sherpa-onnx: pip3 install sherpa-onnx", file=sys.stderr)
    sys.exit(1)

try:
    import websockets
    from websockets.server import serve
except ImportError:
    print("错误: 请先安装 websockets: pip3 install websockets", file=sys.stderr)
    sys.exit(1)


class TranscriptionServer:
    def __init__(
        self,
        model_dir: str,
        use_int8: bool = True,
        num_threads: int = 4,
        vad_threshold: float = 0.5,
        vad_min_silence: float = 1.0,
        vad_min_speech: float = 0.25,
    ):
        model_path = Path(model_dir)

        # 初始化 Silero VAD
        vad_model = model_path / "silero_vad.onnx"
        if not vad_model.exists():
            print(f"错误: VAD 模型不存在: {vad_model}", file=sys.stderr)
            sys.exit(1)

        vad_config = sherpa_onnx.VadModelConfig()
        vad_config.silero_vad.model = str(vad_model)
        vad_config.silero_vad.threshold = vad_threshold
        vad_config.silero_vad.min_silence_duration = vad_min_silence
        vad_config.silero_vad.min_speech_duration = vad_min_speech
        vad_config.sample_rate = 16000

        self.vad = sherpa_onnx.VoiceActivityDetector(
            vad_config, buffer_size_in_seconds=30
        )

        # 初始化 SenseVoice 识别器
        model_file = "model.int8.onnx" if use_int8 else "model.onnx"
        model_onnx = model_path / model_file
        tokens_file = model_path / "tokens.txt"

        if not model_onnx.exists():
            print(f"错误: 模型文件不存在: {model_onnx}", file=sys.stderr)
            sys.exit(1)
        if not tokens_file.exists():
            print(f"错误: tokens 文件不存在: {tokens_file}", file=sys.stderr)
            sys.exit(1)

        self.recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
            model=str(model_onnx),
            tokens=str(tokens_file),
            language="auto",
            use_itn=True,
            num_threads=num_threads,
        )

        self.sample_rate = 16000
        self.clients: set = set()
        self._recording_start_time: dict = {}
        print(f"模型加载完成: {model_onnx.name}")

    def _decode_text(self, samples: np.ndarray) -> str:
        stream = self.recognizer.create_stream()
        stream.accept_waveform(self.sample_rate, samples)
        self.recognizer.decode_stream(stream)
        return stream.result.text.strip()

    async def handle_client(self, websocket):
        self.clients.add(websocket)
        client_id = id(websocket)
        self._recording_start_time[client_id] = time.time()

        # 每个客户端独立的 VAD 实例
        vad_config = self.vad.config
        client_vad = sherpa_onnx.VoiceActivityDetector(
            vad_config, buffer_size_in_seconds=30
        )
        realtime_buffer = np.array([], dtype=np.float32)
        last_partial_text = ""
        last_partial_at = 0.0
        flush_seq = 0
        partial_interval_sec = 1.5
        partial_min_samples = int(self.sample_rate * 1.5)
        partial_max_samples = int(self.sample_rate * 10.0)
        audio_chunk_count = 0
        last_stats_at = 0.0

        print(f"客户端连接: {websocket.remote_address}")
        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    # 接收 Int16 PCM 音频数据
                    samples = (
                        np.frombuffer(message, dtype=np.int16).astype(np.float32)
                        / 32768.0
                    )
                    realtime_buffer = np.concatenate((realtime_buffer, samples))
                    if len(realtime_buffer) > partial_max_samples:
                        realtime_buffer = realtime_buffer[-partial_max_samples:]
                    audio_chunk_count += 1

                    now = time.time()

                    # 每 10 秒打印一次音频统计，帮助诊断"不出字"问题
                    if now - last_stats_at >= 10.0:
                        rms = float(np.sqrt(np.mean(realtime_buffer[-min(len(realtime_buffer), partial_min_samples):] ** 2)))
                        print(f"[stats] chunks={audio_chunk_count} buf={len(realtime_buffer)} rms={rms:.5f}", flush=True)
                        last_stats_at = now

                    if (
                        len(realtime_buffer) >= partial_min_samples
                        and (now - last_partial_at) >= partial_interval_sec
                    ):
                        partial_raw = self._decode_text(realtime_buffer)
                        if partial_raw:
                            partial_lang = self._parse_language(partial_raw)
                            partial_text = self._clean_text(partial_raw)
                            if partial_lang == "zh":
                                partial_lang = self._guess_language_from_text(partial_text)
                            if partial_text and not self._is_similar(partial_text, last_partial_text):
                                partial_resp = {
                                    "type": "partial",
                                    "text": partial_text,
                                    "language": partial_lang,
                                    "flush_seq": flush_seq,
                                    "timestamps": {
                                        "start": 0,
                                        "duration": round(len(realtime_buffer) / self.sample_rate, 2),
                                    },
                                }
                                await websocket.send(json.dumps(partial_resp, ensure_ascii=False))
                                last_partial_text = partial_text
                                last_partial_at = now
                        else:
                            last_partial_at = now

                    client_vad.accept_waveform(samples)

                    while not client_vad.empty():
                        speech = client_vad.front
                        text = self._decode_text(speech.samples)

                        if text:
                            # 解析 SenseVoice 输出的语言标签
                            language = self._parse_language(text)
                            clean_text = self._clean_text(text)
                            if language == "zh":
                                language = self._guess_language_from_text(clean_text)

                            elapsed = (
                                speech.start / self.sample_rate
                            )
                            duration = len(speech.samples) / self.sample_rate

                            response = {
                                "type": "final",
                                "text": clean_text,
                                "language": language,
                                "timestamps": {
                                    "start": round(elapsed, 2),
                                    "duration": round(duration, 2),
                                },
                            }
                            await websocket.send(json.dumps(response, ensure_ascii=False))
                            realtime_buffer = np.array([], dtype=np.float32)
                            last_partial_text = ""
                            last_partial_at = 0.0

                        client_vad.pop()

                elif isinstance(message, str):
                    # 处理控制命令
                    try:
                        cmd = json.loads(message)
                        if cmd.get("type") == "ping":
                            await websocket.send(json.dumps({"type": "pong"}))
                        elif cmd.get("type") == "reset":
                            client_vad = sherpa_onnx.VoiceActivityDetector(
                                vad_config, buffer_size_in_seconds=30
                            )
                            self._recording_start_time[client_id] = time.time()
                            realtime_buffer = np.array([], dtype=np.float32)
                            last_partial_text = ""
                            last_partial_at = 0.0
                        elif cmd.get("type") == "flush_partial":
                            # 前端已提交 partial 文本，清空缓冲区防止重复，但保留 VAD 状态
                            realtime_buffer = np.array([], dtype=np.float32)
                            last_partial_text = ""
                            last_partial_at = 0.0
                            flush_seq = cmd.get("seq", flush_seq)
                    except json.JSONDecodeError:
                        pass

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            self._recording_start_time.pop(client_id, None)
            print(f"客户端断开: {websocket.remote_address}")

    def _parse_language(self, text: str) -> str:
        """从 SenseVoice 输出解析语言标签（如 <|zh|>, <|en|>）"""
        lower = text.lower()
        lang_map = {
            "<|zh|>": "zh",
            "<|en|>": "en",
            "<|ja|>": "ja",
            "<|ko|>": "ko",
            "<|yue|>": "yue",
        }
        for tag, lang in lang_map.items():
            if tag in lower:
                return lang
        return "zh"

    def _clean_text(self, text: str) -> str:
        """清理 SenseVoice 输出中的特殊标签"""
        import re
        # 移除语言标签、情感标签、事件标签
        text = re.sub(r"<\|[^|]*\|>", "", text)
        return text.strip()

    @staticmethod
    def _is_similar(new_text: str, old_text: str) -> bool:
        """判断新 partial 是否与上一次过于相似，避免无意义刷新"""
        if not old_text:
            return False
        if new_text == old_text:
            return True
        # 新文本是旧文本的子串，或旧文本是新文本的子串
        if new_text in old_text or old_text in new_text:
            # 只有长度差异很小时才算相似（避免过滤掉真正更长的更新）
            if abs(len(new_text) - len(old_text)) <= 3:
                return True
        # 编辑距离过小（仅差 1-2 个字符）也跳过
        if abs(len(new_text) - len(old_text)) <= 2:
            common = sum(1 for a, b in zip(new_text, old_text) if a == b)
            if common >= min(len(new_text), len(old_text)) * 0.9:
                return True
        return False

    def _guess_language_from_text(self, text: str) -> str:
        """当模型未返回语言标签时，基于文本字符做轻量兜底判断"""
        import re

        if not text:
            return "zh"

        han_count = len(re.findall(r"[\u3400-\u9fff]", text))
        latin_count = len(re.findall(r"[A-Za-z]", text))
        kana_count = len(re.findall(r"[\u3040-\u30ff]", text))
        hangul_count = len(re.findall(r"[\uac00-\ud7af]", text))

        # 日文假名（平假名/片假名）
        if kana_count > 0:
            return "ja"
        # 韩文
        if hangul_count > 0:
            return "ko"

        # 中文为主但夹杂少量英文术语（如 VAD / API）时，仍判中文
        if han_count > 0 and latin_count <= max(3, int(han_count * 0.25)):
            return "zh"

        # 英文判定：需要有一定连续英文占比，避免“有英文就误判”
        if latin_count >= 6 and latin_count >= int(han_count * 0.6):
            return "en"

        if han_count > 0:
            return "zh"
        if latin_count > 0:
            return "en"

        # 默认中文（含汉字及其他情况）
        return "zh"


async def main():
    parser = argparse.ArgumentParser(description="实时语音转写 WebSocket 后端")
    parser.add_argument("--model-dir", required=True, help="SenseVoice 模型目录路径")
    parser.add_argument("--port", type=int, default=18888, help="WebSocket 端口 (默认: 18888)")
    parser.add_argument("--use-int8", action="store_true", default=True, help="使用 int8 量化模型")
    parser.add_argument("--no-int8", action="store_true", help="不使用 int8 量化模型")
    parser.add_argument("--num-threads", type=int, default=4, help="推理线程数 (默认: 4)")
    parser.add_argument("--vad-threshold", type=float, default=0.5, help="VAD 阈值")
    parser.add_argument("--vad-min-silence", type=float, default=1.0, help="VAD 最小静音时长(秒)")
    parser.add_argument("--vad-min-speech", type=float, default=0.25, help="VAD 最小语音时长(秒)")
    parser.add_argument("--idle-timeout", type=int, default=0, help="无连接超时退出秒数 (0=不超时)")
    parser.add_argument("--partial-profile", default="stable", help="实时预览稳定性档位 (stable/fast)")
    parser.add_argument("--recognition-mode", default="zh-en", help="识别语言模式 (zh/en/zh-en)")
    args = parser.parse_args()

    use_int8 = not args.no_int8

    server = TranscriptionServer(
        model_dir=args.model_dir,
        use_int8=use_int8,
        num_threads=args.num_threads,
        vad_threshold=args.vad_threshold,
        vad_min_silence=args.vad_min_silence,
        vad_min_speech=args.vad_min_speech,
    )

    stop_event = asyncio.Event()

    def handle_signal():
        print("\n收到终止信号，正在关闭...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    if sys.platform != "win32":
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, handle_signal)
    else:
        # Windows 不支持 add_signal_handler，通过 signal 模块注册回调
        signal.signal(signal.SIGINT, lambda *_: handle_signal())
        signal.signal(signal.SIGTERM, lambda *_: handle_signal())

    async with serve(
        server.handle_client,
        "127.0.0.1",
        args.port,
        max_size=2**20,  # 1MB max message
    ) as ws_server:
        print(f"Server started on ws://127.0.0.1:{args.port}")
        sys.stdout.flush()

        if args.idle_timeout > 0:
            # 带超时的运行模式
            while not stop_event.is_set():
                await asyncio.sleep(5)
                if not server.clients:
                    # 无客户端，检查是否超时
                    pass  # 可在此加入超时计时逻辑
        else:
            await stop_event.wait()

    print("服务已关闭")


if __name__ == "__main__":
    asyncio.run(main())
