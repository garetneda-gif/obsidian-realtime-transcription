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
    def __init__(self, model_dir: str, use_int8: bool = True, num_threads: int = 4):
        model_path = Path(model_dir)

        # 初始化 Silero VAD
        vad_model = model_path / "silero_vad.onnx"
        if not vad_model.exists():
            print(f"错误: VAD 模型不存在: {vad_model}", file=sys.stderr)
            sys.exit(1)

        vad_config = sherpa_onnx.VadModelConfig()
        vad_config.silero_vad.model = str(vad_model)
        vad_config.silero_vad.threshold = 0.5
        vad_config.silero_vad.min_silence_duration = 0.5
        vad_config.silero_vad.min_speech_duration = 0.25
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

    async def handle_client(self, websocket):
        self.clients.add(websocket)
        client_id = id(websocket)
        self._recording_start_time[client_id] = time.time()

        # 每个客户端独立的 VAD 实例
        vad_config = self.vad.config
        client_vad = sherpa_onnx.VoiceActivityDetector(
            vad_config, buffer_size_in_seconds=30
        )

        print(f"客户端连接: {websocket.remote_address}")
        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    # 接收 Int16 PCM 音频数据
                    samples = (
                        np.frombuffer(message, dtype=np.int16).astype(np.float32)
                        / 32768.0
                    )
                    client_vad.accept_waveform(samples)

                    while not client_vad.empty():
                        speech = client_vad.front
                        stream = self.recognizer.create_stream()
                        stream.accept_waveform(self.sample_rate, speech.samples)
                        self.recognizer.decode_stream(stream)
                        text = stream.result.text.strip()

                        if text:
                            # 解析 SenseVoice 输出的语言标签
                            language = self._parse_language(text)
                            clean_text = self._clean_text(text)

                            elapsed = (
                                speech.start / self.sample_rate
                            )
                            duration = len(speech.samples) / self.sample_rate

                            response = {
                                "text": clean_text,
                                "language": language,
                                "timestamps": {
                                    "start": round(elapsed, 2),
                                    "duration": round(duration, 2),
                                },
                            }
                            await websocket.send(json.dumps(response, ensure_ascii=False))

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
        lang_map = {
            "<|zh|>": "zh",
            "<|en|>": "en",
            "<|ja|>": "ja",
            "<|ko|>": "ko",
            "<|yue|>": "yue",
        }
        for tag, lang in lang_map.items():
            if tag in text:
                return lang
        return "zh"

    def _clean_text(self, text: str) -> str:
        """清理 SenseVoice 输出中的特殊标签"""
        import re
        # 移除语言标签、情感标签、事件标签
        text = re.sub(r"<\|[^|]*\|>", "", text)
        return text.strip()


async def main():
    parser = argparse.ArgumentParser(description="实时语音转写 WebSocket 后端")
    parser.add_argument("--model-dir", required=True, help="SenseVoice 模型目录路径")
    parser.add_argument("--port", type=int, default=18888, help="WebSocket 端口 (默认: 18888)")
    parser.add_argument("--use-int8", action="store_true", default=True, help="使用 int8 量化模型")
    parser.add_argument("--no-int8", action="store_true", help="不使用 int8 量化模型")
    parser.add_argument("--num-threads", type=int, default=4, help="推理线程数 (默认: 4)")
    parser.add_argument("--idle-timeout", type=int, default=0, help="无连接超时退出秒数 (0=不超时)")
    args = parser.parse_args()

    use_int8 = not args.no_int8

    server = TranscriptionServer(
        model_dir=args.model_dir,
        use_int8=use_int8,
        num_threads=args.num_threads,
    )

    stop_event = asyncio.Event()

    def handle_signal():
        print("\n收到终止信号，正在关闭...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, handle_signal)

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
