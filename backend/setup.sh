#!/bin/bash
# macOS / Linux 一键安装脚本
# 用法：在终端中 cd 到此目录后运行 bash setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

echo "=== 实时语音转写插件 - Python 环境安装 ==="
echo ""

# 检查 Python
if ! command -v python3 &>/dev/null; then
  echo "❌ 未找到 python3，请先安装 Python 3.10~3.12"
  echo "   macOS: brew install python@3.12"
  exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✅ 检测到 Python $PYTHON_VERSION"

# 创建虚拟环境
echo ""
echo "正在创建虚拟环境..."
python3 -m venv "$VENV_DIR"
echo "✅ 虚拟环境创建完成"

# 安装依赖
echo ""
echo "正在安装 sherpa-onnx（从官方 PyPI，约 150~300 MB，请耐心等待）..."
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install sherpa-onnx -i https://pypi.org/simple/
"$VENV_DIR/bin/pip" install websockets numpy

echo "✅ 所有依赖安装完成"

# 验证
"$VENV_DIR/bin/python" -c "import sherpa_onnx; print('✅ sherpa_onnx 导入成功')"

# 输出 Python 路径
PYTHON_PATH="$VENV_DIR/bin/python"
echo ""
echo "================================================"
echo "✅ 安装完成！"
echo ""
echo "请将以下路径复制到插件设置 → 后端设置 → Python 路径："
echo ""
echo "  $PYTHON_PATH"
echo ""
echo "================================================"
