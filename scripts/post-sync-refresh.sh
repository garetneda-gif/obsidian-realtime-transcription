#!/usr/bin/env bash
# 用途：在 remotely-save 同步完成后，重新覆盖插件文件并强制重载插件
# 示例：bash scripts/post-sync-refresh.sh --vault "/path/to/vault" --vault-name "MyVault"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PLUGIN_ID="realtime-transcription"
VAULT_PATH="${OBSIDIAN_VAULT_PATH:-}"
VAULT_NAME="${OBSIDIAN_VAULT_NAME:-}"

usage() {
  cat <<'USAGE'
用法:
  post-sync-refresh.sh --vault <vault_path> [--vault-name <vault_name>] [--plugin-id <plugin_id>]

参数:
  --vault       Obsidian Vault 本地路径（必填，或通过环境变量 OBSIDIAN_VAULT_PATH 提供）
  --vault-name  Obsidian CLI 的 vault 名称（可选，多库时建议指定）
  --plugin-id   插件 ID，默认 realtime-transcription
  -h, --help    显示帮助
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault)
      VAULT_PATH="$2"
      shift 2
      ;;
    --vault-name)
      VAULT_NAME="$2"
      shift 2
      ;;
    --plugin-id)
      PLUGIN_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] 未知参数: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$VAULT_PATH" ]]; then
  echo "[ERROR] 缺少 vault 路径，请传入 --vault 或设置 OBSIDIAN_VAULT_PATH" >&2
  usage
  exit 1
fi

if [[ ! -d "$VAULT_PATH" ]]; then
  echo "[ERROR] vault 路径不存在: $VAULT_PATH" >&2
  exit 1
fi

TARGET_PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$TARGET_PLUGIN_DIR"

echo "[INFO] 二次复制插件文件到: $TARGET_PLUGIN_DIR"
cp -f "$PROJECT_ROOT/manifest.json" "$TARGET_PLUGIN_DIR/manifest.json"
cp -f "$PROJECT_ROOT/main.js" "$TARGET_PLUGIN_DIR/main.js"
cp -f "$PROJECT_ROOT/styles.css" "$TARGET_PLUGIN_DIR/styles.css"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude "__pycache__/" \
    "$PROJECT_ROOT/backend/" "$TARGET_PLUGIN_DIR/backend/"
else
  rm -rf "$TARGET_PLUGIN_DIR/backend"
  cp -R "$PROJECT_ROOT/backend" "$TARGET_PLUGIN_DIR/backend"
fi

echo "[INFO] 已完成二次复制"

if ! command -v obsidian >/dev/null 2>&1; then
  echo "[ERROR] 未找到 Obsidian CLI 命令 'obsidian'，无法强制重载插件" >&2
  echo "[HINT] 先安装并确保可执行: https://help.obsidian.md/cli" >&2
  exit 1
fi

echo "[INFO] 调用 Obsidian CLI 强制重载插件: $PLUGIN_ID"
if [[ -n "$VAULT_NAME" ]]; then
  obsidian "vault=$VAULT_NAME" plugin:reload "id=$PLUGIN_ID"
else
  obsidian plugin:reload "id=$PLUGIN_ID"
fi

echo "[OK] 插件文件已覆盖并完成强制重载"
