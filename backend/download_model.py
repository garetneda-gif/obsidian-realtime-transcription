#!/usr/bin/env python3
"""
下载 SenseVoice-Small 模型文件和 Silero VAD 模型
"""

import argparse
import os
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

SENSEVOICE_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"
)

SILERO_VAD_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "asr-models/silero_vad.onnx"
)

REQUIRED_FILES = ["model.int8.onnx", "tokens.txt", "silero_vad.onnx"]


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
            sys.stdout.write(f"\r  进度: {percent:.1f}% ({mb_done:.1f}/{mb_total:.1f} MB)")
        else:
            mb_done = downloaded / (1024 * 1024)
            sys.stdout.write(f"\r  已下载: {mb_done:.1f} MB")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, str(dest), reporthook=report)
    print()  # 换行


def extract_tar_bz2(archive: Path, dest_dir: Path):
    """解压 tar.bz2 文件"""
    print(f"解压: {archive}")
    with tarfile.open(str(archive), "r:bz2") as tar:
        tar.extractall(path=str(dest_dir))
    print("解压完成")


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

    # 检查是否已存在所有需要的文件
    all_exist = all((output_dir / f).exists() for f in REQUIRED_FILES)
    if all_exist:
        print("所有模型文件已存在，跳过下载。")
        print(f"模型目录: {output_dir}")
        return

    # 下载 SenseVoice 模型
    archive_name = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"
    archive_path = output_dir / archive_name

    if not (output_dir / "model.int8.onnx").exists():
        download_with_progress(SENSEVOICE_URL, archive_path)
        extract_tar_bz2(archive_path, output_dir)

        # 移动文件到目标目录（解压后有一层子目录）
        extracted_dir = output_dir / "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
        if extracted_dir.exists():
            for f in extracted_dir.iterdir():
                target = output_dir / f.name
                if not target.exists():
                    f.rename(target)
            extracted_dir.rmdir()

        # 清理压缩包
        if archive_path.exists():
            archive_path.unlink()
            print(f"已删除压缩包: {archive_name}")
    else:
        print("SenseVoice 模型已存在，跳过。")

    # 下载 Silero VAD 模型
    vad_path = output_dir / "silero_vad.onnx"
    if not vad_path.exists():
        download_with_progress(SILERO_VAD_URL, vad_path)
    else:
        print("Silero VAD 模型已存在，跳过。")

    # 验证
    print("\n验证模型文件:")
    for f in REQUIRED_FILES:
        fp = output_dir / f
        if fp.exists():
            size_mb = fp.stat().st_size / (1024 * 1024)
            print(f"  ✓ {f} ({size_mb:.1f} MB)")
        else:
            print(f"  ✗ {f} (缺失!)")

    print(f"\n模型目录: {output_dir}")


if __name__ == "__main__":
    main()
