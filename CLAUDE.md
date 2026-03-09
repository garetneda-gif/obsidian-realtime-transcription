# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Obsidian 实时语音转写插件——本地运行的语音识别工具，基于 SenseVoice-Small + sherpa-onnx，支持中/英/日/韩/粤语。前后端分离架构：TypeScript 前端（Obsidian 插件）通过 WebSocket 与 Python 后端通信。

## 构建命令

```bash
npm install        # 安装前端依赖
npm run dev        # 监视构建（inline sourcemap）
npm run build      # 生产构建（压缩，无 sourcemap）
```

后端无需构建，Python 直接运行。后端依赖安装：`pip install -r backend/requirements.txt`

输出产物为 `main.js`（esbuild 打包，CJS 格式，target ES2020）。

## 架构

```
Obsidian 插件 (TypeScript) ── WebSocket ── Python 后端 (sherpa-onnx)
     │                                          │
     ├─ 麦克风采集 (Web Audio API, 16kHz mono)    ├─ server.py: ASR 推理 + WebSocket 服务
     ├─ 实时文本处理 (去重/稳定/聚合)              └─ download_model.py: 模型自动下载
     ├─ LLM 调用 (翻译/润色/摘要)
     └─ 侧边栏 UI + 笔记导出
```

### 核心模块

- **`src/main.ts`** — 插件入口，协调所有服务：录制控制、WebSocket 消息处理、文本聚合、AI 后处理、历史持久化
- **`src/services/BackendManager.ts`** — Python 后端生命周期管理（启动/停止/端口管理）
- **`src/services/WebSocketClient.ts`** — WebSocket 连接管理与自动重连
- **`src/services/AudioCapture.ts`** — Web Audio API 麦克风采集
- **`src/services/TranslationService.ts`** / **`SummaryService.ts`** / **`FormalizeService.ts`** — OpenAI 兼容 API 调用（翻译/摘要+AI命名/润色）
- **`src/views/TranscriptionView.ts`** — 侧边栏主视图 UI
- **`src/settings.ts`** — 设置面板
- **`src/types.ts`** — 全局类型定义（TranscriptEntry, PluginSettings 等）
- **`backend/server.py`** — sherpa-onnx 推理 + WebSocket 服务器

### WebSocket 协议

前→后: `audio_frame`(Int16Array), `reset`, `flush_partial`(带 seq)
后→前: `partial`(text + language + flush_seq), `final`(text + language)

### 关键文本处理流程（`main.ts`）

1. **前缀去重** (`lastCommittedPartialText`) — ≥50% 前缀匹配视为重复，防止后端缓冲区竞态
2. **Partial 稳定性过滤** (`stabilizePartialText`) — 首次2字即显、尾部增长立即放行、回滚受控二次确认（快模式1次/稳定模式2次）
3. **文本聚合** — 同语言多个 final 在 `flushWindowSec`(默认4s) 内合并，上限 `maxChars`(默认320)

### 历史记录持久化

存储路径: `<vault>/.obsidian/plugins/realtime-transcription/transcript-entries.json`
序列化/反序列化: `src/utils/entrySerializer.ts`

## 添加新 LLM 功能的模式

1. 在 `types.ts` 定义 `XxxSettings` 接口
2. 创建 `src/services/XxxService.ts`（参考 TranslationService 的 OpenAI 兼容调用模式）
3. 在 `settings.ts` 添加对应设置项
4. 在 `main.ts` 初始化服务并在适当时机调用

## 调试

Obsidian 开发者控制台: `Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Windows)
关键日志前缀: `[Transcription]`

## GitHub 操作约定

- 本仓库涉及 GitHub 的自动化操作（如创建 PR、查看 Issue、发布版本、推送协作流程）统一使用 GitHub CLI：`gh`
- 不使用 GitHub MCP 作为默认 GitHub 操作通道

## 兼容性要求

- Obsidian ≥ 1.4.0
- Python 3.10–3.12
- Node.js 18+（构建用）
