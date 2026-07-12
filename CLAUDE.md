# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Obsidian 实时语音转写插件——支持本地模型（SenseVoice-Small + sherpa-onnx）和云端（腾讯云实时 ASR）两种识别引擎，中/英/日/韩/粤语。前后端分离架构：TypeScript 前端（Obsidian 插件）通过 WebSocket 与后端通信。

## 构建命令

```bash
npm install        # 安装前端依赖
npm run dev        # 监视构建（inline sourcemap）
npm run build      # 生产构建（压缩，无 sourcemap）
```

后端无需构建，Python 直接运行。后端依赖安装：`pip install -r backend/requirements.txt`

输出产物为 `main.js`（esbuild 打包，CJS 格式，target ES2020）。

**部署到 Obsidian**：构建后需将 `main.js` 复制到 vault 的插件目录（`<vault>/.obsidian/plugins/realtime-transcription/`），然后在 Obsidian 中重新加载插件。项目目录本身不是 Obsidian 加载的位置。

**测试**：`node --experimental-strip-types --test tests/**/*.test.ts`

## 架构

```
Obsidian 插件 (TypeScript)
     │
     ├─ 麦克风采集 (Web Audio API, 16kHz mono Int16 PCM)
     │
     ├─[本地模式] WebSocket → Python 后端 (sherpa-onnx + Silero VAD)
     ├─[云端模式] TencentASRClient → 腾讯云 ASR WebSocket (HMAC-SHA1 签名)
     │
     ├─ 文本处理管线 (去重 → 稳定性过滤 → 聚合)
     ├─ LLM 后处理 (翻译/润色/摘要，OpenAI 兼容 API)
     ├─ 侧边栏 UI + 笔记导出
     └─ i18n 双语 (中/英)
```

### ASR 提供方切换

`settings.asrProvider` 控制录制路径分流（`main.ts` 的 `startRecording`）：

- **`"local"`**：`BackendManager.start()` → `WebSocketClient.connect(port)` → 音频发送到本地 Python
- **`"tencent"`**：跳过 BackendManager，`TencentASRClient.connect()` → 音频直发腾讯云

两者通过 duck typing 共享 `sendAudio` / `sendCommand` / `disconnect` 接口，下游文本处理完全一致。工厂方法：`getActiveASRClient()`。

### 核心模块

- **`src/main.ts`** — 插件入口，协调所有服务：录制控制、ASR 提供方分流、文本处理管线、AI 后处理、历史持久化
- **`src/services/BackendManager.ts`** — Python 后端生命周期管理（启动/停止/端口管理/孤儿进程清理）
- **`src/services/WebSocketClient.ts`** — 本地模式 WebSocket 连接管理与自动重连
- **`src/services/TencentASRClient.ts`** — 腾讯云模式：HMAC-SHA1 URL 签名、服务器时间同步、`slice_type` 结果映射（0=忽略, 1=partial, 2=final）
- **`src/services/AudioCapture.ts`** — Web Audio API 麦克风采集（16kHz 重采样，Float32→Int16 转换）
- **`src/services/TranslationService.ts`** / **`SummaryService.ts`** / **`FormalizeService.ts`** — OpenAI 兼容 API 调用（翻译/摘要+AI命名/润色）
- **`src/views/TranscriptionView.ts`** — 侧边栏主视图 UI（streaming 卡片、历史列表、导出）
- **`src/settings.ts`** — 设置面板（根据 `asrProvider` 条件显示本地/云端配置区块）
- **`src/types.ts`** — 全局类型定义（PluginSettings, TranscriptEntry, TencentASRSettings 等）
- **`src/i18n.ts`** — 中英双语 i18n，`t("key")` 函数 + `setLocale()`
- **`backend/server.py`** — sherpa-onnx 推理 + Silero VAD + WebSocket 服务器

### WebSocket 协议（本地模式）

前→后: `audio_frame`(Int16Array 二进制), `reset`(JSON), `flush_partial`(JSON, 带 seq)
后→前: `partial`(text + language + flush_seq), `final`(text + language)

### 腾讯云 ASR 协议

- 签名原文：`asr.cloud.tencent.com/asr/v2/{appId}?{sorted_params}`（**无 GET 前缀**）
- 签名方式：`HMAC-SHA1(plaintext, secretKey) → Base64 → encodeURIComponent`
- 使用服务器时间 `fetch("https://asr.cloud.tencent.com/server_time")` 避免时钟偏差
- 参数集仅含必要字段（secretid, timestamp, expired, nonce, engine_model_type, voice_id, voice_format）
- 结果映射：`slice_type=1` → partial，`slice_type=2` → final

### 关键文本处理流程（`main.ts`）

1. **前缀去重** (`src/utils/transcriptDedup.ts`) — 标点无关的前缀匹配，≥50% 重叠视为重复，防止后端缓冲区竞态
2. **Partial 稳定性过滤** (`src/utils/partialStability.ts` + `main.ts#stabilizePartialText`) — 首次2字即显、尾部增长立即放行、回滚受控二次确认（快模式1次/稳定模式2次）；比较时忽略标点/空白差异
3. **文本聚合** — 同语言多个 final 在 `flushWindowSec`(默认4s) 内合并，上限 `maxChars`(默认320)

### 云端 vs 本地模式的文本处理差异

腾讯云 ASR 每个 partial 发送**累积式完整句子文本**，本地后端发送**增量式缓冲区文本**。因此云端模式（`asrProvider !== "local"`）跳过三层本地专用过滤：

1. **`committedPartialTexts` 前缀去重** — 云端累积文本会被截成碎片
2. **`stabilizePartialText`** — 云端已管理文本稳定性，标点变化不应被拒绝
3. **`flushPendingTranscript` 中 partialOnly 定时提交** — 云端改为刷新流式卡片并重新等待 `slice_type=2`（句子 final），避免提前提交不完整 partial

修改云端文本处理逻辑时，搜索 `isCloud` / `isCloudProvider` / `isCloudFlush` 定位这些 guard。

### 历史记录持久化

存储路径: `<vault>/.obsidian/plugins/realtime-transcription/transcript-entries.json`
序列化/反序列化: `src/utils/entrySerializer.ts`（Date ↔ ISO 字符串）
保存策略: 500ms 防抖定时器批量写入

## 添加新 ASR 提供方的模式

1. 在 `types.ts` 的 `AsrProvider` 联合类型中添加新值，定义对应 `XxxSettings` 接口
2. 创建 `src/services/XxxASRClient.ts`（需实现 `connect/disconnect/sendAudio/sendCommand/setOnResult/setOnStatusChange/setOnReconnecting` 方法，参考 TencentASRClient）
3. 在 `main.ts` 的 `startRecording` 中添加新分支，`getActiveASRClient` 中添加返回逻辑
4. 在 `settings.ts` 的 ASR 提供方下拉框中添加选项和对应配置 UI

## 添加新 LLM 功能的模式

1. 在 `types.ts` 定义 `XxxSettings` 接口
2. 创建 `src/services/XxxService.ts`（参考 TranslationService 的 OpenAI 兼容调用模式）
3. 在 `settings.ts` 添加对应设置项
4. 在 `main.ts` 初始化服务并在适当时机调用

## 调试

Obsidian 开发者控制台: `Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Windows)
关键日志前缀: `[Transcription]`（插件主逻辑）、`[TencentASR]`（云端签名/连接）、`[Transcription Backend]`（Python 后端）

## GitHub 操作约定

- 本仓库涉及 GitHub 的自动化操作（如创建 PR、查看 Issue、发布版本、推送协作流程）统一使用 GitHub CLI：`gh`
- 不使用 GitHub MCP 作为默认 GitHub 操作通道

## 发布流程

```bash
# 1. 更新 package.json 和 manifest.json 中的版本号
# 2. npm run build
# 3. git add + commit + push
# 4. 创建 GitHub Release（Obsidian 社区插件需要 main.js + manifest.json + styles.css 作为附件）
gh release create <version> main.js manifest.json styles.css --title "v<version>" --notes "..."
```

## 兼容性要求

- Obsidian ≥ 1.4.0
- Python 3.10–3.12（仅本地模式需要）
- Node.js 18+（构建用）
