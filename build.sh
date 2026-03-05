#!/bin/bash
# 一键构建两平台发布包
# 用法：bash build.sh
# 输出：dist/macos/realtime-transcription/  和  dist/windows/realtime-transcription/

set -e
PROJ="$(cd "$(dirname "$0")" && pwd)"

echo "=== 构建 Realtime Transcription 插件 ==="
echo ""

# 1. 编译 TypeScript -> main.js
echo "▶ 编译前端..."
npm --prefix "$PROJ" run build
echo "✅ main.js 构建完成"
echo ""

# 2. 清空并重建 dist 目录
echo "▶ 组装发布包..."
rm -rf "$PROJ/dist"
mkdir -p "$PROJ/dist/macos/realtime-transcription/backend"
mkdir -p "$PROJ/dist/windows/realtime-transcription/backend"

# 3. 两平台共用文件
SHARED_FRONTEND=(main.js manifest.json styles.css)
SHARED_BACKEND=(backend/server.py backend/requirements.txt)

for PLATFORM in macos windows; do
  DST="$PROJ/dist/$PLATFORM/realtime-transcription"
  for f in "${SHARED_FRONTEND[@]}"; do
    cp "$PROJ/$f" "$DST/"
  done
  for f in "${SHARED_BACKEND[@]}"; do
    cp "$PROJ/$f" "$DST/backend/"
  done
done

# 4. macOS 专用文件
#    download_model.py: 多备用镜像源 + socket 超时 + stdout 无缓冲（更稳定）
cp "$PROJ/backend/platform/macos/download_model.py" \
   "$PROJ/dist/macos/realtime-transcription/backend/download_model.py"
cp "$PROJ/backend/setup.sh" \
   "$PROJ/dist/macos/realtime-transcription/backend/setup.sh"
chmod +x "$PROJ/dist/macos/realtime-transcription/backend/setup.sh"

# 5. Windows 专用文件
cp "$PROJ/backend/platform/windows/download_model.py" \
   "$PROJ/dist/windows/realtime-transcription/backend/download_model.py"
cp "$PROJ/backend/setup.bat" \
   "$PROJ/dist/windows/realtime-transcription/backend/setup.bat"

echo "✅ 发布包组装完成"
echo ""
echo "输出目录："
echo "  macOS  → dist/macos/realtime-transcription/"
echo "  Windows → dist/windows/realtime-transcription/"
echo ""
echo "=== 发布包文件清单 ==="
find "$PROJ/dist" -type f | sed "s|$PROJ/||" | sort
echo ""
echo "✅ 全部完成！"
