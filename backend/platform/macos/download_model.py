#!/usr/bin/env python3
"""
下载 SenseVoice-Small 模型文件和 Silero VAD 模型
逐文件下载，支持多源回退和断点重试
"""
from __future__ import annotations  # Python 3.9 兼容 str | None 语法

import argparse
import shutil
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# HuggingFace 主站 + 国内镜像
HF_SOURCES = [
    "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main",
    "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main",
]

# Silero VAD：GitHub + 国内镜像（多备用源）
VAD_SOURCES = [
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    "https://ghproxy.net/https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    "https://mirror.ghproxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
]

def get_required_files(use_int8: bool):
    model_name = "model.int8.onnx" if use_int8 else "model.onnx"
    return [
        (model_name, HF_SOURCES, "{base}/" + model_name),
        ("tokens.txt", HF_SOURCES, "{base}/tokens.txt"),
        ("silero_vad.onnx", VAD_SOURCES, None),  # VAD 源直接是完整 URL
    ]

MAX_RETRIES = 3


def _build_opener():
    """构建一个跳过 SSL 验证的 opener（部分镜像站证书有问题）"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    handler = urllib.request.HTTPSHandler(context=ctx)
    return urllib.request.build_opener(handler)


def download_with_progress(url: str, dest: Path) -> bool:
    """带进度的文件下载，返回是否成功"""
    print(f"  下载: {url}", flush=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")

    def report(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100, downloaded * 100 / total_size)
            mb_done = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            sys.stdout.write(f"\r  进度: {percent:.1f}% ({mb_done:.1f}/{mb_total:.1f} MB)")
        else:
            mb_done = downloaded / (1024 * 1024)
            sys.stdout.write(f"\r  已下载: {mb_done:.1f} MB")
        sys.stdout.flush()

    opener = _build_opener()
    urllib.request.install_opener(opener)
    try:
        urllib.request.urlretrieve(url, str(tmp), reporthook=report)
        print(flush=True)
        # 下载成功，重命名
        if dest.exists():
            dest.unlink()
        shutil.move(str(tmp), str(dest))
        return True
    except Exception as e:
        print(f"\n  下载失败: {e}", flush=True)
        if tmp.exists():
            tmp.unlink()
        return False


def download_file(filename: str, sources: list, url_template: str | None, dest_dir: Path) -> bool:
    """尝试从多个源下载文件，支持重试"""
    dest = dest_dir / filename
    if dest.exists():
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"  ✓ {filename} 已存在 ({size_mb:.1f} MB)，跳过", flush=True)
        return True

    for source_idx, base_url in enumerate(sources):
        url = url_template.format(base=base_url) if url_template else base_url
        for attempt in range(1, MAX_RETRIES + 1):
            print(f"\n[{filename}] 源 {source_idx + 1}/{len(sources)}，"
                  f"尝试 {attempt}/{MAX_RETRIES}", flush=True)
            if download_with_progress(url, dest):
                return True
            if attempt < MAX_RETRIES:
                wait = attempt * 3
                print(f"  等待 {wait} 秒后重试...", flush=True)
                time.sleep(wait)
        print(f"  源 {source_idx + 1} 全部重试失败，切换下一个源", flush=True)

    print(f"  ✗ {filename} 所有下载源均失败!", file=sys.stderr, flush=True)
    return False


def main():
    # 强制 stdout 无缓冲，确保 Obsidian 插件能实时读到进度
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

    # 每次连接/读取最多等 60 秒，避免无限挂起
    socket.setdefaulttimeout(60)

    parser = argparse.ArgumentParser(description="下载 SenseVoice 模型文件")
    parser.add_argument("--output-dir", type=str, required=True, help="模型存放目录")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--use-int8", dest="use_int8", action="store_true", default=True,
                       help="下载 Int8 量化模型（默认）")
    group.add_argument("--no-int8", dest="use_int8", action="store_false",
                       help="下载全精度模型 model.onnx")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    required_files = get_required_files(args.use_int8)

    # 检查是否已存在所有文件
    all_exist = all((output_dir / name).exists() for name, _, _ in required_files)
    if all_exist:
        print("所有模型文件已存在，跳过下载。", flush=True)
        print(f"模型目录: {output_dir}", flush=True)
        return

    print(f"模型目录: {output_dir}\n", flush=True)

    failed = []
    for filename, sources, url_template in required_files:
        if not download_file(filename, sources, url_template, output_dir):
            failed.append(filename)

    # 验证
    print("\n═══ 验证模型文件 ═══", flush=True)
    for name, _, _ in required_files:
        fp = output_dir / name
        if fp.exists():
            size_mb = fp.stat().st_size / (1024 * 1024)
            print(f"  ✓ {name} ({size_mb:.1f} MB)", flush=True)
        else:
            print(f"  ✗ {name} (缺失!)", flush=True)

    if failed:
        print(f"\n以下文件下载失败: {', '.join(failed)}", file=sys.stderr, flush=True)
        print("请检查网络连接后重试，或手动下载文件放到上述目录。", file=sys.stderr, flush=True)
        sys.exit(1)
    else:
        print(f"\n全部下载完成！模型目录: {output_dir}", flush=True)


if __name__ == "__main__":
    main()

