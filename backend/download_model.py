#!/usr/bin/env python3
"""
下载 SenseVoice-Small 模型文件和 Silero VAD 模型
只下载必需的单个文件，避免下载 999MB 的完整压缩包
"""

import argparse
import sys
import urllib.request
from pathlib import Path

# 从 HuggingFace 单独下载每个文件（比下载 999MB tar.bz2 快得多）
FILES = {
    "model.int8.onnx": (
        "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/"
        "resolve/main/model.int8.onnx"
    ),
    "tokens.txt": (
        "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/"
        "resolve/main/tokens.txt"
    ),
    "silero_vad.onnx": (
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
        "asr-models/silero_vad.onnx"
    ),
}


def download_with_progress(url: str, dest: Path):
    """带进度的文件下载"""
    print(f"下载: {url}")
    print(f"保存到: {dest}")

    def report(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100, downloaded * 100 / total_size)
            mb_done = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            sys.stdout.write(
                f"\r  进度: {percent:.1f}% ({mb_done:.1f}/{mb_total:.1f} MB)"
            )
        else:
            mb_done = downloaded / (1024 * 1024)
            sys.stdout.write(f"\r  已下载: {mb_done:.1f} MB")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, str(dest), reporthook=report)
    print()


def main():
    parser = argparse.ArgumentParser(description="下载 SenseVoice 模型文件")
    parser.add_argument(
        "--output-dir",
        type=str,
        required=True,
        help="模型存放目录",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 检查是否已全部存在
    all_exist = all((output_dir / f).exists() for f in FILES)
    if all_exist:
        print("所有模型文件已存在，跳过下载。")
        print(f"模型目录: {output_dir}")
        return

    # 逐个下载缺失的文件
    for filename, url in FILES.items():
        dest = output_dir / filename
        if dest.exists():
            size_mb = dest.stat().st_size / (1024 * 1024)
            print(f"已存在: {filename} ({size_mb:.1f} MB)，跳过。")
            continue

        print(f"\n--- 下载 {filename} ---")
        try:
            download_with_progress(url, dest)
        except Exception as e:
            print(f"\n下载失败: {e}", file=sys.stderr)
            # 删除不完整的文件
            if dest.exists():
                dest.unlink()
            sys.exit(1)

    # 验证
    print("\n验证模型文件:")
    ok = True
    for filename in FILES:
        fp = output_dir / filename
        if fp.exists():
            size_mb = fp.stat().st_size / (1024 * 1024)
            print(f"  ✓ {filename} ({size_mb:.1f} MB)")
        else:
            print(f"  ✗ {filename} (缺失!)")
            ok = False

    if ok:
        print(f"\n全部下载完成！模型目录: {output_dir}")
    else:
        print("\n部分文件缺失，请重试。")
        sys.exit(1)


if __name__ == "__main__":
    main()
