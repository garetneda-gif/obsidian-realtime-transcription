# 实时语音转写 for Obsidian

[中文](https://github.com/garetneda-gif/obsidian-realtime-transcription/blob/main/README.md) | [English](https://github.com/garetneda-gif/obsidian-realtime-transcription/blob/main/README_EN.md)

<p align="center">
  基于 <strong>SenseVoice-Small + Silero VAD + sherpa-onnx</strong> 的本地实时语音转写 Obsidian 插件
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-%3E%3D1.4.0-7c3aed" alt="Obsidian version">
  <img src="https://img.shields.io/badge/Python-3.10--3.12-3776ab" alt="Python version">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

### 功能特性

| 功能 | 说明 |
|------|------|
| **本地实时转写** | 完全本地运行，无需联网，支持边说边显示 |
| **多语言识别** | 中文 / 英文 / 日文 / 韩文 / 粤语 |
| **识别模式** | 可限定本地识别引擎输出为纯中文、纯英文或中英混杂模式 |
| **实时预览模式** | 稳态档（更准）/ 极速档（更快）两档切换 |
| **自动翻译** | 检测到非中文内容时，自动调用 OpenAI 兼容 API 翻译成中文 |
| **AI 文本润色** | 手动触发，将口语化转写润色为规范书面语 |
| **AI 自动摘要** | 按字数阈值自动生成摘要（默认每 500 字触发一次） |
| **二次摘要（综合总结）** | 累积多个摘要后自动生成一份综合总结 |
| **导出为笔记** | 一键导出为 Obsidian Markdown 笔记，支持时间戳/AI/手动三种命名方式 |
| **历史记录持久化** | 关闭 Obsidian 后转写记录不丢失 |
| **跨平台支持** | macOS / Windows / Linux 全平台兼容 |

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

> 若你使用 remotely-save，可能在同步结束时被旧版 `main.js` 覆盖。可在同步完成后执行：
>
> ```bash
> npm run post-sync-refresh -- --vault "/你的/Vault/路径" --vault-name "你的Vault名称"
> ```
>
> 该命令会再次复制插件文件，并通过 Obsidian CLI 执行 `plugin:reload` 强制重载。

#### 云端计费服务（部署者）

`billing-server/` 是云端托管转写的账户、充值和签名服务。生产环境启动前会校验必需配置，至少需要设置：

```bash
BS_ENV=production
BS_SECRET_KEY=<至少 32 位随机字符串>
BS_DATABASE_URL=sqlite:////data/billing.db
TENCENT_APP_ID=<腾讯云 AppID>
TENCENT_SECRET_ID=<腾讯云 SecretId>
TENCENT_SECRET_KEY=<腾讯云 SecretKey>
AP_XUNHU_APPID=<虎皮椒 AppID>
AP_XUNHU_APPSECRET=<虎皮椒 AppSecret>
AP_XUNHU_NOTIFY_URL=https://你的域名/api/billing/callback/xunhu
BS_PUBLIC_SERVER_URL=https://你的域名
BS_CORS_ORIGINS=app://obsidian.md
```

用户充值入口在 `https://你的域名/account`。账户中心可独立登录/注册并处理充值、订单刷新和用量查看；插件设置页仍保留云端账户登录，用于获取转写 API token。

本地自检：

```bash
cd billing-server
python -m pip install -r requirements.txt
python self_check.py
python app.py
```

健康检查：`/healthz`；就绪检查：`/readyz`。测试或一次性任务可设置 `BS_DISABLE_SETTLEMENT_LOOP=1` 禁用后台超时结算循环。

---

### 第二步：安装 Python

> 如果你已有 Python 3.10 ~ 3.12，可跳过此步。

**检查是否已安装 Python：**

```bash
# macOS / Linux
python3 --version

# Windows（命令提示符或 PowerShell）
python --version
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

在插件目录的 `backend/` 文件夹中提供了一键安装脚本，**运行一次即可**，无需手动输入任何 pip 命令。

#### macOS / Linux

双击 `backend/setup.command`（macOS 可直接双击运行），或在终端中运行：

```bash
cd <你的Vault>/.obsidian/plugins/realtime-transcription/backend
bash setup.command
```

#### Windows

双击 `backend\setup.bat`，或在命令提示符中运行：

```bat
cd <你的Vault>\.obsidian\plugins\realtime-transcription\backend
setup.bat
```

脚本会自动完成：创建虚拟环境 → 安装所有依赖 → 验证安装 → **输出第五步需要填写的 Python 路径**。

> **遇到报错？** 确认已安装 Python 3.10~3.12，且终端/PowerShell 有网络访问权限。

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

将以下三个文件**分别下载**到同一目录（每个都是独立文件，无需解压）：

| 文件 | 下载链接（点击直接下载） | 大小 |
|------|------------------------|------|
| `model.int8.onnx` | [HuggingFace 下载](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx) · [国内镜像](https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx) | ~229 MB |
| `tokens.txt` | [HuggingFace 下载](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt) · [国内镜像](https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt) | <1 MB |
| `silero_vad.onnx` | [GitHub 下载](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) | ~1.8 MB |

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

- `Python 路径`：填写 Python 的路径
  - macOS / Linux：填 `python3`（大多数情况下直接可用）
  - Windows：填 `python`（插件会自动设置此默认值）

  > 如果默认值不工作，需要获取 Python 完整路径：
  > - macOS/Linux：在终端运行 `which python3`
  > - Windows：在命令提示符运行 `where python`，复制第一行结果

  各平台路径示例：

  | 系统 | Python 路径示例 |
  |------|----------------|
  | macOS（系统 Python） | `python3` 或 `/usr/local/bin/python3` |
  | macOS（虚拟环境，推荐） | `/Users/你的用户名/.../backend/venv/bin/python` |
  | Windows | `C:\Users\yourname\AppData\Local\Programs\Python\Python312\python.exe` |
  | Linux | `python3` 或 `/usr/bin/python3` |

- `后端端口`：默认 18888，一般无需修改

- 点击 **检测环境** 按钮验证配置：
  - **成功**：弹出通知「环境检测通过：Python + sherpa-onnx 可用」→ 可继续
  - **失败**：见下方[环境检测失败排查](#环境检测失败排查)

#### 模型设置

- `模型目录`：填入第四步中创建的目录完整路径
- `识别模式`：`中英混杂`（默认）/ `纯中文` / `纯英文`

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
| 「环境检测失败，请执行 pip install...」| sherpa-onnx 依赖未安装 | 按第三步说明安装依赖后重试 |
| 「环境检测失败」但依赖已安装 | 使用了虚拟环境，但 Python 路径仍指向系统 Python | 将「Python 路径」改为虚拟环境路径，例如 `/path/to/backend/venv/bin/python` |
| 检测无反应，按钮灰色 | Python 路径字段为空 | macOS/Linux 填 `python3`；Windows 填 `python` |
| 「No such file or directory」| Python 路径不存在 | macOS/Linux 运行 `which python3`；Windows 运行 `where python` 获取正确路径 |
| Windows 上找不到 python | Python 未加入系统 PATH | 重新安装 Python，安装时勾选「Add Python to PATH」|

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

#### Windows 后端启动报 NotImplementedError

如果在 v1.0.2 或更早版本遇到 `NotImplementedError: add_signal_handler` 错误，请升级至 v1.0.3+。此问题已在新版本中修复。

#### macOS 首次运行弹出安全警告

macOS 可能拦截未经公证的 Python 脚本，出现「无法验证开发者」提示：

1. 打开「系统设置」→「隐私与安全性」
2. 找到相关提示，点击「仍要打开」或「允许」
3. 返回 Obsidian，重新点击开始录制

---

### 安全提示

- `data.json`（含 API Key）**不要**提交到 Git 或分享给他人
- 换新设备时建议手动在插件设置中重新填写 API Key

### 云端收费服务

云端托管模式使用 `billing-server/`：服务端持有腾讯云 ASR 密钥，插件登录后向服务端请求签名 URL，服务端预扣余额，录音结束后按时长结算。

最小启动配置：

```bash
export BS_SECRET_KEY="至少 32 位随机字符串"
export TENCENT_APP_ID="腾讯云 AppID"
export TENCENT_SECRET_ID="腾讯云 SecretID"
export TENCENT_SECRET_KEY="腾讯云 SecretKey"
export AP_XUNHU_APPID="虎皮椒 AppID"
export AP_XUNHU_APPSECRET="虎皮椒 AppSecret"
export AP_XUNHU_NOTIFY_URL="https://你的域名/api/billing/callback/xunhu"
export BS_PUBLIC_SERVER_URL="https://你的域名"
export BS_PRICE_PER_HOUR_CENTS=200

cd billing-server
pip install -r requirements.txt
python app.py
```

上线后把插件设置里的「服务器地址」填成你的 HTTPS API 域名。充值页地址为 `https://你的域名/account`，支付回跳会带上订单号并在账户中心里继续刷新订单状态；插件内登录继续用于云端转写鉴权。

---

### Contributing

Pull requests and issues are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a Pull Request

---

### 许可证

MIT License — 详见 [LICENSE](LICENSE)。
