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
  <img src="https://img.shields.io/badge/Python-3.10--3.12-3776ab" alt="Python version">
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

---

### 第一步：安装 Obsidian 插件

#### 方式 A：从 Release 直接安装（推荐普通用户）

1. 前往 [Releases](https://github.com/garetneda-gif/obsidian-realtime-transcription/releases) 下载最新版本的 zip 文件
2. 解压后，将文件夹**重命名为** `realtime-transcription`
3. 将该文件夹整体复制到你 Vault 的插件目录：
   - macOS / Linux：`<你的Vault>/.obsidian/plugins/realtime-transcription/`
   - Windows：`<你的Vault>\.obsidian\plugins\realtime-transcription\`

   > 不知道 Vault 在哪？打开 Obsidian → 左下角「管理库」→ 查看库的本地路径。

4. 打开 Obsidian → **设置** → **第三方插件** → 关闭安全模式 → 找到「实时语音转写」并启用

#### 方式 B：从源码构建（推荐开发者）

```bash
git clone https://github.com/garetneda-gif/obsidian-realtime-transcription.git
cd obsidian-realtime-transcription
npm install
npm run build
# 构建产物：根目录的 main.js
# 将 manifest.json、main.js、styles.css、backend/ 复制到 Vault 插件目录
```

---

### 第二步：安装 Python

> 如果你已有 Python 3.10 ~ 3.12，可跳过此步。

**检查是否已安装 Python：**

```bash
python3 --version
```

输出类似 `Python 3.11.x` 则已安装，可继续。否则按下方系统安装：

| 系统 | 安装方式 |
|------|---------|
| **macOS** | 推荐：`brew install python@3.12`（需先安装 [Homebrew](https://brew.sh)）<br>或：从 [python.org](https://www.python.org/downloads/) 下载安装包 |
| **Windows** | 从 [python.org](https://www.python.org/downloads/) 下载安装包，**安装时务必勾选「Add Python to PATH」** |
| **Linux** | `sudo apt install python3.12 python3.12-pip`（Ubuntu/Debian） |

> **推荐版本：3.10 / 3.11 / 3.12**。3.13 和 3.14 兼容性尚未充分测试，不建议使用。

---

### 第三步：安装 Python 依赖

在终端（macOS/Linux）或命令提示符（Windows）中，进入插件目录后执行：

```bash
pip3 install -r backend/requirements.txt
```

或直接安装：

```bash
pip3 install sherpa-onnx>=1.10.0 websockets>=12.0 numpy>=1.24.0
```

**验证安装成功：**

```bash
pip3 list | grep sherpa-onnx
# 输出类似：sherpa-onnx   1.10.x  ← 看到版本号说明安装成功
```

---

### 第四步：准备模型文件

模型文件需要存放在一个**你自己创建的目录**中（插件不会自动创建目录）。

**先创建模型目录：**

```bash
# macOS / Linux
mkdir -p ~/obsidian-models

# Windows（命令提示符）
mkdir C:\Users\你的用户名\obsidian-models
```

**然后下载模型（二选一）：**

#### 方法一：插件内一键下载（推荐）

1. 打开 Obsidian → 设置 → 实时语音转写 → **模型设置**
2. 在「模型目录」字段填入刚创建的目录路径：
   - macOS/Linux：`/Users/你的用户名/obsidian-models`
   - Windows：`C:\Users\你的用户名\obsidian-models`
3. 点击 **下载模型** 按钮（约 240 MB，需要网络，耐心等待）
4. 弹出「模型下载完成！」通知后即可

#### 方法二：手动下载

将以下三个文件下载到同一目录：

| 文件 | 直接下载链接 | 大小 |
|------|------------|------|
| `model.int8.onnx` | [下载（需解压 tar.bz2）](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2) | ~229 MB |
| `tokens.txt` | 同上压缩包内 | <1 MB |
| `silero_vad.onnx` | [直接下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) | ~1.8 MB |

> **提示**：建议保持「使用 Int8 量化模型」为开启状态（默认已开启），可将模型体积从 895 MB 压缩至 229 MB，精度基本无损。

**确认三个文件都在目录中：**

```bash
ls ~/obsidian-models
# 应该看到：model.int8.onnx   tokens.txt   silero_vad.onnx
```

---

### 第五步：插件配置

打开 Obsidian → **设置** → **实时语音转写**，按以下顺序配置：

#### 后端设置

- `Python 路径`：填写 Python 的路径（不确定时填 `python3`，Windows 可能需要填完整路径）

  > 如何获取 Python 完整路径？
  > - macOS/Linux：在终端运行 `which python3`
  > - Windows：在命令提示符运行 `where python.exe`，复制第一行结果

  各平台路径示例：

  | 系统 | Python 路径示例 |
  |------|----------------|
  | macOS | `python3` 或 `/usr/local/bin/python3` |
  | Windows | `C:\Users\yourname\AppData\Local\Programs\Python\Python312\python.exe` |
  | Linux | `python3` 或 `/usr/bin/python3` |

- `后端端口`：默认 18888，一般无需修改

- 点击 **检测环境** 按钮验证配置：
  - **成功**：弹出通知「环境检测通过：Python + sherpa-onnx 可用」→ 可继续
  - **失败**：见下方[环境检测失败排查](#环境检测失败排查)

#### 模型设置

- `模型目录`：填入第四步中创建的目录完整路径
- `识别语言范围`：`中英混杂`（默认）/ `纯中文` / `纯英文`

  > 说中文时识别出日语或韩语？将此项改为「纯中文」。

#### 翻译 / 润色 / 摘要设置（均为可选）

这三项功能需要调用 AI 接口，支持任意 **OpenAI 兼容 API**（如 DeepSeek、通义千问、本地 Ollama 等）。

| 字段 | 填写说明 |
|------|---------|
| API 端点 | 完整 URL，例如 `https://api.deepseek.com/v1/chat/completions` |
| API Key | 对应服务的密钥，以 `sk-` 开头 |
| 模型名称 | 例如 `deepseek-chat`、`qwen-turbo`、`gpt-4o-mini` |

> 如果暂时不需要翻译/摘要功能，直接跳过这三项，保持关闭状态即可。

#### 高级设置（可选，默认值已够用）

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| 实时模式预设 | 稳态档更准，极速档更快 | 稳态档 |
| 实时预览 | 边说边显示识别中的文字 | 开启 |
| VAD 静音阈值 | 越大分句越少 | 1.0 s |
| 聚合输出窗口 | 越大段落越长（延迟也越大） | 4 s |
| 单段最大字数 | 超过此长度自动换段 | 320 字 |

---

### 使用方法

1. 点击左侧 Ribbon 栏的**麦克风图标**，打开转写面板
2. 点击面板中的**开始录制**按钮
3. 对着麦克风说话，右侧面板实时显示转写文字
4. 说完后点击**停止录制**
5. 可选：点击任意条目上的**润色**按钮，用 AI 整理为书面语
6. 点击**导出笔记**，将转写内容保存为 Obsidian 笔记文件

---

### 常见问题排查

#### 环境检测失败排查

| 提示内容 | 可能原因 | 解决方案 |
|---------|---------|---------|
| 「环境检测失败，请执行 pip3 install...」| sherpa-onnx 依赖未安装 | 运行 `pip3 install sherpa-onnx websockets numpy` 后重试 |
| 检测无反应，按钮灰色 | Python 路径字段为空 | 在设置中填入 `python3` |
| 「No such file or directory」| Python 路径不存在 | 重新运行 `which python3` 获取正确路径 |
| Windows 上找不到 python3 | Python 未加入系统 PATH | 重新安装 Python，安装时勾选「Add to PATH」|

#### 后端启动失败：错误信息对照表

| 错误提示 | 原因 | 解决方案 |
|---------|------|---------|
| `模型文件缺失: model.int8.onnx` | 模型未下完或目录填错 | 检查模型目录路径，重新点击「下载模型」 |
| `模型文件缺失: tokens.txt` | 同上 | 同上 |
| `模型文件缺失: silero_vad.onnx` | 同上 | 同上 |
| `后端启动超时（30秒）` | 模型首次加载慢，或 Python 环境有问题 | 关闭其他占用内存的程序后重试；确认依赖已安装 |
| `[Errno 2] No such file or directory` | Python 路径填错 | 重新检查 Python 路径配置 |

> **查看详细错误日志**：
> - macOS：`Cmd + Option + I` → Console 标签
> - Windows：`Ctrl + Shift + I` → Console 标签
>
> 将红色报错信息复制后可在 [Issues](https://github.com/garetneda-gif/obsidian-realtime-transcription/issues) 提问。

#### 翻译返回 404 错误

检查 API URL 是否多写了 `/v1`：

```
# 错误
https://api.example.com/v1v1/chat/completions

# 正确
https://api.example.com/v1/chat/completions
```

#### 频繁出现 429 限流

- 换用速率更高的模型或提升 API 套餐额度
- 关闭自动翻译，改为手动触发
- 调大「聚合输出窗口」（减少 API 调用频率）

#### 识别结果分句太碎

在高级设置中调大：
- `VAD 静音阈值`（建议从 1.0 调到 1.5~2.0）
- `聚合输出窗口`（建议从 4 调到 6~8）

#### macOS 首次运行弹出安全警告

macOS 可能拦截未经公证的 Python 脚本，出现「无法验证开发者」提示：

1. 打开「系统设置」→「隐私与安全性」
2. 找到相关提示，点击「仍要打开」或「允许」
3. 返回 Obsidian，重新点击开始录制

---

### 安全提示

- `data.json`（含 API Key）**不要**提交到 Git 或分享给他人
- 换新设备时建议手动在插件设置中重新填写 API Key

---

### Contributing

Pull requests and issues are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a Pull Request

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

---

### Step 1: Install the Obsidian Plugin

#### Option A: From Release (recommended for regular users)

1. Go to [Releases](https://github.com/garetneda-gif/obsidian-realtime-transcription/releases) and download the latest zip file
2. Extract it and **rename the folder** to `realtime-transcription`
3. Copy the folder to your Vault's plugins directory:
   - macOS / Linux: `<your-vault>/.obsidian/plugins/realtime-transcription/`
   - Windows: `<your-vault>\.obsidian\plugins\realtime-transcription\`

   > Not sure where your Vault is? Open Obsidian → Click the vault icon (bottom left) → View the local path.

4. Open Obsidian → **Settings** → **Community Plugins** → Disable Safe Mode → Enable **Realtime Transcription**

#### Option B: Build from Source (for developers)

```bash
git clone https://github.com/garetneda-gif/obsidian-realtime-transcription.git
cd obsidian-realtime-transcription
npm install
npm run build
# Copy manifest.json, main.js, styles.css, backend/ to your Vault plugin directory
```

---

### Step 2: Install Python

> Skip this step if you already have Python 3.10–3.12.

**Check if Python is installed:**

```bash
python3 --version
```

If you see `Python 3.11.x` (or similar), you're good. Otherwise, install Python for your OS:

| OS | How to install |
|----|----------------|
| **macOS** | Recommended: `brew install python@3.12` (requires [Homebrew](https://brew.sh))<br>Or: Download installer from [python.org](https://www.python.org/downloads/) |
| **Windows** | Download installer from [python.org](https://www.python.org/downloads/). **Check "Add Python to PATH"** during install. |
| **Linux** | `sudo apt install python3.12 python3.12-pip` (Ubuntu/Debian) |

> **Recommended versions: 3.10 / 3.11 / 3.12.** Versions 3.13 and 3.14 have not been fully tested.

---

### Step 3: Install Python Dependencies

Open a terminal (macOS/Linux) or Command Prompt (Windows) and run:

```bash
pip3 install -r backend/requirements.txt
```

Or install manually:

```bash
pip3 install sherpa-onnx>=1.10.0 websockets>=12.0 numpy>=1.24.0
```

**Verify the installation:**

```bash
pip3 list | grep sherpa-onnx
# You should see: sherpa-onnx   1.10.x
```

---

### Step 4: Prepare Model Files

You need to create a folder to store model files. The plugin will not create it automatically.

**Create the model directory:**

```bash
# macOS / Linux
mkdir -p ~/obsidian-models

# Windows (Command Prompt)
mkdir C:\Users\YourUsername\obsidian-models
```

**Then download the models (choose one method):**

#### Method 1: In-plugin download (recommended)

1. Open Obsidian → Settings → Realtime Transcription → **Model Settings**
2. Enter the directory path you just created in the **Model Directory** field:
   - macOS/Linux: `/Users/YourUsername/obsidian-models`
   - Windows: `C:\Users\YourUsername\obsidian-models`
3. Click **Download Model** (~240 MB, requires internet, please wait patiently)
4. A notification "Model download complete!" means success

#### Method 2: Manual download

Download all three files into the same directory:

| File | Download | Size |
|------|----------|------|
| `model.int8.onnx` | [Download (extract from tar.bz2)](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2) | ~229 MB |
| `tokens.txt` | Inside the same archive | <1 MB |
| `silero_vad.onnx` | [Direct download](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) | ~1.8 MB |

> **Tip**: Keep `Use Int8 quantized model` enabled (default). It reduces model size from 895 MB to 229 MB with negligible quality loss.

**Verify all three files are present:**

```bash
ls ~/obsidian-models
# Should show: model.int8.onnx   tokens.txt   silero_vad.onnx
```

---

### Step 5: Configure the Plugin

Open Obsidian → **Settings** → **Realtime Transcription** and configure in order:

#### Backend Settings

- `Python Path`: Enter your Python path (try `python3` first; Windows may need the full path)

  > How to find the full Python path:
  > - macOS/Linux: Run `which python3` in terminal
  > - Windows: Run `where python.exe` in Command Prompt, use the first result

  Path examples by OS:

  | OS | Python Path Example |
  |----|---------------------|
  | macOS | `python3` or `/usr/local/bin/python3` |
  | Windows | `C:\Users\yourname\AppData\Local\Programs\Python\Python312\python.exe` |
  | Linux | `python3` or `/usr/bin/python3` |

- `Backend Port`: Default 18888, usually no need to change

- Click **Check Environment** to verify your setup:
  - **Success**: Notification "Environment check passed: Python + sherpa-onnx available" → proceed
  - **Failed**: See [Environment Check Failures](#environment-check-failures) below

#### Model Settings

- `Model Directory`: Enter the full path to the directory from Step 4
- `Recognition Mode`: `Chinese+English` (default) / `Chinese only` / `English only`

  > Getting Japanese/Korean when speaking Chinese? Switch to `Chinese only`.

#### Translation / Formalization / Summary Settings (all optional)

These features require an AI API. Any **OpenAI-compatible API** works (OpenAI, DeepSeek, Qwen, local Ollama, etc.).

| Field | What to enter |
|-------|---------------|
| API Endpoint | Full URL, e.g. `https://api.deepseek.com/v1/chat/completions` |
| API Key | Your service API key (usually starts with `sk-`) |
| Model Name | e.g. `deepseek-chat`, `qwen-turbo`, `gpt-4o-mini` |

> If you don't need translation/summary now, just skip these sections and leave them disabled.

#### Advanced Settings (optional, defaults work well)

| Setting | Description | Default |
|---------|-------------|---------|
| Realtime Profile | Stable (more accurate) / Fast (lower latency) | Stable |
| Realtime Preview | Show partial results while speaking | On |
| VAD Silence Threshold | Larger = fewer sentence splits | 1.0 s |
| Aggregation Window | Larger = longer paragraphs (more delay) | 4 s |
| Max Chars per Segment | Auto-split when segment exceeds this length | 320 chars |

---

### Usage

1. Click the **microphone icon** in the left Ribbon to open the transcription panel
2. Click **Start Recording**
3. Speak — text appears in real time on the right panel
4. Click **Stop Recording** when done
5. Optionally click the **Formalize** button on any entry to polish the text
6. Click **Export Note** to save as an Obsidian Markdown file

---

### Troubleshooting

#### Environment Check Failures

| Message | Likely Cause | Fix |
|---------|-------------|-----|
| "Environment check failed, please run pip3 install..." | sherpa-onnx not installed | Run `pip3 install sherpa-onnx websockets numpy` then retry |
| No response, button stays gray | Python Path field is empty | Enter `python3` in the Python Path setting |
| "No such file or directory" | Python path is wrong | Run `which python3` (macOS/Linux) or `where python.exe` (Windows) to get the correct path |
| Python not found (Windows) | Python not added to PATH | Reinstall Python and check "Add Python to PATH" |

#### Backend Startup Failures

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `Model file missing: model.int8.onnx` | Download incomplete or wrong directory | Check model directory path; re-run the Download Model step |
| `Model file missing: tokens.txt` | Same as above | Same as above |
| `Model file missing: silero_vad.onnx` | Same as above | Same as above |
| `Backend startup timed out (30s)` | Slow first load or bad Python env | Close other memory-heavy apps; verify all dependencies are installed |
| `[Errno 2] No such file or directory` | Python path is wrong | Double-check the Python Path setting |

> **View detailed error logs:**
> - macOS: `Cmd + Option + I` → Console tab
> - Windows: `Ctrl + Shift + I` → Console tab
>
> Copy any red error messages and open a [GitHub Issue](https://github.com/garetneda-gif/obsidian-realtime-transcription/issues) for help.

#### Translation Returns 404

Check for a duplicated `/v1` in your API URL:

```
# Wrong
https://api.example.com/v1v1/chat/completions

# Correct
https://api.example.com/v1/chat/completions
```

#### Frequent 429 Rate-Limit Errors

- Switch to a model with higher rate limits or upgrade your API plan
- Disable auto-translation and translate manually instead
- Increase the Aggregation Window to reduce API call frequency

#### Transcription Segments Are Too Choppy

Increase these two values in Advanced Settings:
- `VAD Silence Threshold` (try 1.5–2.0 s)
- `Aggregation Window` (try 6–8 s)

#### macOS Security Warning on First Run

macOS may block unnotarized Python scripts with an "unidentified developer" alert:

1. Open **System Settings** → **Privacy & Security**
2. Scroll down to find the blocked item and click **Open Anyway**
3. Return to Obsidian and start recording again

---

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
