# 实时语音转写 · Realtime Transcription for Obsidian

<p align="center">
  <a href="#中文文档">中文</a> | <a href="#english-documentation">English</a>
</p>

<p align="center">
  基于 <strong>SenseVoice-Small + Silero VAD + sherpa-onnx</strong> 的本地实时语音转写 Obsidian 插件<br>
  A local, real-time speech-to-text Obsidian plugin powered by <strong>SenseVoice-Small + Silero VAD + sherpa-onnx</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-%3E%3D1.4.0-7c3aed" alt="Obsidian version">
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776ab" alt="Python version">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## 中文文档

### 功能特性

| 功能 | 说明 |
|------|------|
| **本地实时转写** | 完全本地运行，无需联网，支持边说边显示 |
| **多语言识别** | 中文 / 英文 / 日文 / 韩文 / 粤语 |
| **识别语言范围** | 可限定为纯中文、纯英文或中英混杂模式 |
| **实时预览模式** | 稳态档（更准）/ 极速档（更快）两档切换 |
| **自动翻译** | 检测到非中文内容时，自动调用 OpenAI 兼容 API 翻译成中文 |
| **AI 文本润色** | 手动触发，将口语化转写润色为规范书面语 |
| **AI 自动摘要** | 按字数阈值自动生成摘要（默认每 3000 字触发一次） |
| **导出为笔记** | 一键导出为 Obsidian Markdown 笔记，支持时间戳/AI/手动三种命名方式 |
| **历史记录持久化** | 关闭 Obsidian 后转写记录不丢失 |

### 架构概览

```
Obsidian 插件 (TypeScript)
├── src/
│   ├── main.ts               # 插件主入口，协调所有服务
│   ├── settings.ts           # 设置面板 UI
│   ├── types.ts              # 类型定义
│   ├── constants.ts          # 常量
│   ├── services/
│   │   ├── BackendManager.ts     # Python 后端进程管理（启动/停止）
│   │   ├── WebSocketClient.ts    # 与后端的 WebSocket 通信
│   │   ├── AudioCapture.ts       # 麦克风音频采集（Web Audio API）
│   │   ├── TranslationService.ts # 调用 LLM API 翻译
│   │   ├── SummaryService.ts     # 调用 LLM API 摘要 + AI 命名
│   │   └── FormalizeService.ts   # 调用 LLM API 文本润色
│   ├── views/
│   │   ├── TranscriptionView.ts  # 右侧边栏主视图
│   │   └── TitleInputModal.ts    # 手动命名导出弹窗
│   └── utils/
│       ├── pluginPaths.ts        # 插件目录解析
│       └── entrySerializer.ts    # 历史记录序列化
│
└── backend/                  # Python 后端
    ├── server.py             # WebSocket 服务端（sherpa-onnx 推理）
    ├── download_model.py     # 模型自动下载脚本
    └── requirements.txt      # Python 依赖

数据流：
麦克风 → AudioCapture → WebSocket → server.py → sherpa-onnx
                                               ↓
                              partial/final 文本 → 聚合 → 翻译/摘要/润色 → 视图
```

### 前置条件

- Obsidian 桌面版 ≥ 1.4.0（仅桌面端，不支持移动端）
- Python 3.10 ~ 3.12（推荐）或 3.14+
- 麦克风访问权限

### 安装

#### 方式 A：从 Release 直接安装（推荐普通用户）

1. 前往 [Releases](https://github.com/garetneda-gif/realtime-transcription/releases) 下载最新版本
2. 解压后将整个目录放入目标 Vault 的插件目录：
   - macOS / Linux：`<你的Vault>/.obsidian/plugins/realtime-transcription/`
   - Windows：`<你的Vault>\.obsidian\plugins\realtime-transcription\`
3. 打开 Obsidian → 设置 → 第三方插件 → 关闭安全模式 → 启用 **实时语音转写**

#### 方式 B：从源码构建（推荐开发者）

```bash
# 克隆仓库
git clone https://github.com/garetneda-gif/realtime-transcription.git
cd realtime-transcription

# 安装 Node.js 依赖并构建
npm install
npm run build

# 将以下文件复制到 Vault 插件目录：
# manifest.json  main.js  styles.css  backend/
```

### 安装 Python 依赖

```bash
pip3 install -r backend/requirements.txt
# 或手动安装
pip3 install sherpa-onnx>=1.10.0 websockets>=12.0 numpy>=1.24.0
```

### 下载模型文件

#### 方法一：插件内一键下载（推荐）

1. 插件设置 → **模型设置** → 填写**模型目录**路径（该目录须已存在）
2. 点击 **下载模型** 按钮（约 240 MB，需要网络连接）

#### 方法二：手动下载

将以下三个文件放入同一目录：

| 文件 | 下载来源 | 大小 |
|------|---------|------|
| `model.int8.onnx` | [SenseVoice-Small](https://github.com/k2-fsa/sherpa-onnx/releases) | ~229 MB |
| `tokens.txt` | 同上 | <1 MB |
| `silero_vad.onnx` | [Silero VAD](https://github.com/snakers4/silero-vad) | ~1.8 MB |

> **提示**：建议开启 `使用 Int8 量化模型`（默认已开启），模型从 895 MB 缩减至 229 MB，精度基本无损。

### 首次配置

在 Obsidian → 设置 → 实时语音转写 中配置：

**后端设置**
- `Python 路径`：填写 Python 可执行文件路径（默认 `python3`）
- `后端端口`：WebSocket 端口（默认 18888，若被占用请修改）
- 点击 **检测环境** 验证 Python 和 sherpa-onnx 是否可用

**模型设置**
- `模型目录`：包含模型文件的目录绝对路径
- `识别语言范围`：`中英混杂`（默认）/ `纯中文` / `纯英文`

**翻译设置**（可选）
- 开启后，识别到非中文内容时自动调用 LLM 翻译
- 支持任意 OpenAI 兼容 API（DeepSeek、通义千问等）

**润色设置**（可选）
- 独立的 API 配置，用于手动触发文本润色

**AI 摘要设置**（可选）
- 开启后，每累计 N 字（默认 3000）自动生成一次摘要
- 独立的 API 配置，互不干扰

**高级设置**
| 参数 | 说明 | 推荐值 |
|------|------|--------|
| 实时模式预设 | 稳态档更准，极速档更快 | 稳态档 |
| 实时预览 | 边说边显示 partial 结果 | 开启 |
| VAD 静音阈值 | 越大分句越少 | 1.0 s |
| 聚合输出窗口 | 越大段落越长（延迟也越大） | 4 s |
| 单段最大字数 | 超过此长度自动换段 | 320 字 |

### 使用方法

1. 点击左侧 Ribbon 的 **麦克风图标**，或执行命令 `打开实时语音转写面板`
2. 点击 **开始录制** 按钮（或使用命令 `开始/停止录制`）
3. 说话，右侧面板实时显示转写结果
4. 点击 **停止录制**
5. 可选：点击任意条目的 **润色** 按钮进行文本优化
6. 点击 **导出笔记** 保存到当前 Vault

### 常见问题

#### 点击录制没有反应 / 后端启动失败

1. 检查插件设置中 Python 路径是否正确
2. 运行 `pip3 install sherpa-onnx websockets numpy` 确认依赖已安装
3. 点击设置中的 **检测环境** 按钮
4. 检查端口 18888 是否被占用（可修改为其他端口）

#### 翻译返回 404 错误

检查 API URL 是否正确，常见错误：

```
# 错误（多了一个 v1）
https://api.example.com/v1v1/chat/completions

# 正确
https://api.example.com/v1/chat/completions
```

#### 频繁出现 429 限流

- 换用速率更高的模型或 API
- 关闭自动翻译，改为手动翻译
- 调大聚合输出窗口（减少每分钟 API 调用次数）

#### 识别结果分句太碎

调大以下两个参数：
- `VAD 静音阈值`（Settings → 高级设置）
- `聚合输出窗口`（Settings → 高级设置）

#### 识别出现日语/韩语误判（说的是中文）

将 `识别语言范围` 设置为 `纯中文`。

### 安全提示

- `data.json`（含 API Key）**不要**提交到 Git 或分享给他人
- 换新设备时建议手动在插件设置中重新填写 API Key

---

## English Documentation

### Features

| Feature | Description |
|---------|-------------|
| **Local real-time transcription** | Fully local inference, no internet required, streaming text display |
| **Multi-language recognition** | Chinese / English / Japanese / Korean / Cantonese |
| **Recognition mode** | Limit to Chinese-only, English-only, or mixed mode |
| **Real-time profile** | Stable mode (more accurate) / Fast mode (lower latency) |
| **Auto translation** | Automatically translate non-Chinese speech to Chinese via OpenAI-compatible API |
| **AI text formalization** | On-demand polishing of colloquial transcriptions into formal written text |
| **AI auto-summary** | Generate summaries after a configurable character threshold (default: 3000 chars) |
| **Export to note** | One-click export to Obsidian Markdown note; timestamp / AI-generated / manual title |
| **Persistent history** | Transcription history survives Obsidian restarts |

### Architecture Overview

```
Obsidian Plugin (TypeScript)
├── src/
│   ├── main.ts               # Plugin entry point, orchestrates all services
│   ├── settings.ts           # Settings UI tab
│   ├── types.ts              # TypeScript type definitions
│   ├── constants.ts          # Shared constants
│   ├── services/
│   │   ├── BackendManager.ts     # Python backend process lifecycle (start/stop)
│   │   ├── WebSocketClient.ts    # WebSocket communication with backend
│   │   ├── AudioCapture.ts       # Microphone capture (Web Audio API)
│   │   ├── TranslationService.ts # LLM API calls for translation
│   │   ├── SummaryService.ts     # LLM API calls for summarization & AI naming
│   │   └── FormalizeService.ts   # LLM API calls for text formalization
│   ├── views/
│   │   ├── TranscriptionView.ts  # Main sidebar panel view
│   │   └── TitleInputModal.ts    # Manual note-naming modal
│   └── utils/
│       ├── pluginPaths.ts        # Plugin directory resolution
│       └── entrySerializer.ts    # History serialization/deserialization
│
└── backend/                  # Python backend
    ├── server.py             # WebSocket server (sherpa-onnx inference)
    ├── download_model.py     # Automatic model downloader
    └── requirements.txt      # Python dependencies

Data Flow:
Microphone → AudioCapture → WebSocket → server.py → sherpa-onnx
                                                   ↓
                                partial/final text → aggregation → translate/summarize/formalize → view
```

### Prerequisites

- Obsidian Desktop ≥ 1.4.0 (desktop only, mobile is not supported)
- Python 3.10 – 3.12 (recommended) or 3.14+
- Microphone access permission

### Installation

#### Option A: From Release (recommended for regular users)

1. Go to [Releases](https://github.com/garetneda-gif/realtime-transcription/releases) and download the latest archive
2. Extract and copy the entire folder to your Vault's plugins directory:
   - macOS / Linux: `<your-vault>/.obsidian/plugins/realtime-transcription/`
   - Windows: `<your-vault>\.obsidian\plugins\realtime-transcription\`
3. Open Obsidian → Settings → Community Plugins → Disable Safe Mode → Enable **Realtime Transcription**

#### Option B: Build from Source (for developers)

```bash
# Clone the repository
git clone https://github.com/garetneda-gif/realtime-transcription.git
cd realtime-transcription

# Install dependencies and build
npm install
npm run build

# Copy the following files to your Vault plugin directory:
# manifest.json  main.js  styles.css  backend/
```

### Install Python Dependencies

```bash
pip3 install -r backend/requirements.txt
# or manually
pip3 install sherpa-onnx>=1.10.0 websockets>=12.0 numpy>=1.24.0
```

### Download Model Files

#### Method 1: In-plugin download (recommended)

1. Go to Plugin Settings → **Model Settings** → fill in the **Model Directory** path (must already exist)
2. Click the **Download Model** button (~240 MB, requires internet)

#### Method 2: Manual download

Place the following three files in the same directory:

| File | Source | Size |
|------|--------|------|
| `model.int8.onnx` | [SenseVoice-Small (sherpa-onnx releases)](https://github.com/k2-fsa/sherpa-onnx/releases) | ~229 MB |
| `tokens.txt` | Same as above | <1 MB |
| `silero_vad.onnx` | [Silero VAD](https://github.com/snakers4/silero-vad) | ~1.8 MB |

> **Tip**: Keep `Use Int8 quantized model` enabled (default). It reduces model size from 895 MB to 229 MB with negligible quality loss.

### Initial Configuration

Navigate to Obsidian → Settings → Realtime Transcription:

**Backend Settings**
- `Python Path`: Path to Python executable (default: `python3`)
- `Backend Port`: WebSocket port (default: 18888; change if occupied)
- Click **Check Environment** to verify Python and sherpa-onnx are ready

**Model Settings**
- `Model Directory`: Absolute path to the directory containing model files
- `Recognition Mode`: `Chinese+English` (default) / `Chinese only` / `English only`

**Translation Settings** (optional)
- When enabled, non-Chinese speech is automatically translated to Chinese
- Supports any OpenAI-compatible API (OpenAI, DeepSeek, Qwen, etc.)

**Formalization Settings** (optional)
- Separate API config for on-demand text polishing

**AI Summary Settings** (optional)
- Automatically generate a summary every N characters (default: 3000)
- Separate API config; runs independently of translation

**Advanced Settings**

| Setting | Description | Default |
|---------|-------------|---------|
| Realtime Profile | Stable (more accurate) / Fast (lower latency) | Stable |
| Realtime Preview | Show partial results while speaking | On |
| VAD Silence Threshold | Larger = fewer sentence splits | 1.0 s |
| Aggregation Window | Larger = longer paragraphs (more delay) | 4 s |
| Max Chars per Segment | Auto-split when segment exceeds this length | 320 chars |

### Usage

1. Click the **microphone icon** in the left Ribbon, or run command `Open Realtime Transcription Panel`
2. Click **Start Recording** (or use the command `Toggle Recording`)
3. Speak — transcription appears in real time in the right panel
4. Click **Stop Recording**
5. Optionally click the **Formalize** button on any entry to polish the text
6. Click **Export Note** to save to your current Vault

### Troubleshooting

#### No response when starting recording / Backend fails to start

1. Verify the Python path in plugin settings
2. Run `pip3 install sherpa-onnx websockets numpy` to confirm dependencies
3. Click **Check Environment** in settings
4. Ensure port 18888 is not occupied (change the port in settings if needed)

#### Translation returns 404

Check that the API URL is correct. A common mistake:

```
# Wrong (duplicated v1)
https://api.example.com/v1v1/chat/completions

# Correct
https://api.example.com/v1/chat/completions
```

#### Frequent 429 rate-limit errors

- Switch to a model or plan with higher rate limits
- Disable auto-translation and translate manually
- Increase the aggregation window to reduce API call frequency

#### Transcription segments are too short / choppy

Increase these two values in Advanced Settings:
- `VAD Silence Threshold`
- `Aggregation Window`

#### Chinese speech misidentified as Japanese or Korean

Set `Recognition Mode` to `Chinese only`.

### Security Notes

- Do **not** commit `data.json` (which contains API keys) to Git or share it with others
- On a new machine, re-enter API keys manually in plugin settings

### Contributing

Pull requests and issues are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a Pull Request

### License

MIT License — see [LICENSE](LICENSE) for details.
