# 实时语音转写 Obsidian 插件

基于 `sherpa-onnx + SenseVoice + Silero VAD` 的本地实时转写插件，支持：

- 实时录音转写（含边说边显示的实时预览）
- 中文/英文/日文/韩文/粤语识别
- 非中文自动翻译（可选）
- 自动 AI 摘要（可选，默认每累计 3000 字触发）
- 导出为 Obsidian 笔记

---

## 目录结构（发布时至少需要这些）

```text
realtime-transcription/
  manifest.json
  main.js
  styles.css
  backend/
    server.py
    download_model.py
    requirements.txt
```

说明：`src/`、`package.json` 等是开发构建用，部署运行不必须。

---

## 在另一台电脑安装（详细）

以下步骤按 **macOS / Windows / Linux 的 Obsidian 桌面版** 通用流程写。

## 1. 前置条件

1. 安装 Obsidian 桌面版。
2. 安装 Python 3.10+（建议 3.10~3.12，3.14 也可）。
3. 安装 Python 依赖：

```bash
pip3 install sherpa-onnx websockets numpy
```

或：

```bash
pip3 install -r backend/requirements.txt
```

## 2. 准备模型文件

你需要一个模型目录，至少包含：

- `model.int8.onnx`（或 `model.onnx`）
- `tokens.txt`
- `silero_vad.onnx`

例如：

```text
/Users/yourname/models/
  model.int8.onnx
  tokens.txt
  silero_vad.onnx
```

## 3. 将插件放到目标 Vault

先找到目标 Vault 的插件目录：

- macOS/Linux：`<你的Vault>/.obsidian/plugins/`
- Windows：`<你的Vault>\.obsidian\plugins\`

创建插件目录（目录名必须是插件 id）：

```text
realtime-transcription
```

最终路径示例：

```text
<你的Vault>/.obsidian/plugins/realtime-transcription/
```

把下列文件复制到该目录：

- `manifest.json`
- `main.js`
- `styles.css`
- `backend/`（整个目录）

## 4. 在 Obsidian 中启用插件

1. 打开 Obsidian -> `设置` -> `第三方插件`
2. 关闭安全模式（若未关闭）
3. 启用 `实时语音转写`

## 5. 首次配置（插件设置页）

在插件设置里填写：

1. `Python 路径`
- 常见：`python3`
- 或绝对路径（例如 macOS Homebrew 的 Python 路径）

2. `模型目录`
- 填你第 2 步准备的模型目录

3. `翻译设置`（可选）
- 是否开启自动翻译
- API 端点 / API Key / 模型

4. `AI 摘要设置`（可选，独立于翻译）
- 是否开启自动摘要
- 摘要 API 端点 / API Key / 模型
- 摘要触发字数（默认 3000）

5. `高级设置`
- VAD 静音时长（越大分句越少）
- 聚合输出窗口、单段最大字数

---

## 两种安装方式

## 方式 A：从源码构建后安装（推荐开发者）

在源码目录执行：

```bash
npm install
npm run build
```

构建产物是根目录的 `main.js`。然后按上面的第 3 步复制文件。

## 方式 B：直接拷贝已构建插件（推荐普通使用）

从已可用电脑直接拷贝整个目录：

```text
<原Vault>/.obsidian/plugins/realtime-transcription/
```

到新电脑目标 Vault 的同一路径即可。

---

## 常见问题排查

## 1) 点录音无反应/后端启动失败

检查：

1. Python 路径是否正确。
2. `pip3 install sherpa-onnx websockets numpy` 是否成功。
3. 模型目录是否完整（3 个文件齐全）。
4. 端口是否被占用（默认 18888，可改）。

## 2) 翻译失败（404）

常见是 API 地址写错，例如误写成：

```text
.../v1v1/chat/completions
```

应为：

```text
.../v1/chat/completions
```

## 3) 有翻译但频繁 429

表示接口限流，处理方式：

1. 换模型或提额度。
2. 降低请求频率（关闭自动翻译或减少转写输出频率）。

## 4) 识别分句太碎

调大：

- `VAD 静音阈值`
- `聚合输出窗口`

---

## 升级插件（新电脑）

1. 用新版本覆盖：`main.js`、`styles.css`、`backend/server.py`（建议连同 `manifest.json` 一起更新）。
2. 重载插件（禁用再启用）或重启 Obsidian。

---

## 安全建议

1. 不要把包含 `API Key` 的 `data.json` 提交到 Git 或发给他人。
2. 新电脑尽量手动填写 API Key，不要直接拷贝带密钥配置。

---

## 当前仓库路径

```text
/Users/jikunren/Documents/实时语音转写-ob插件
```

如需，我可以再补一个 `install.sh`，实现：输入 Vault 路径后一键安装到该 Vault。
