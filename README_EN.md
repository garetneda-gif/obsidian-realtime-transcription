# Realtime Transcription for Obsidian

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
</p>

<p align="center">
  A local, real-time speech-to-text Obsidian plugin powered by <strong>SenseVoice-Small + Silero VAD + sherpa-onnx</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-%3E%3D1.4.0-7c3aed" alt="Obsidian version">
  <img src="https://img.shields.io/badge/Python-3.10--3.12-3776ab" alt="Python version">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

### Features

| Feature | Description |
|---------|-------------|
| **Local real-time transcription** | Fully local inference, no internet required, streaming text display |
| **Multi-language recognition** | Chinese / English / Japanese / Korean / Cantonese |
| **Recognition mode** | Limit to Chinese-only, English-only, or mixed mode |
| **Real-time profile** | Stable mode (more accurate) / Fast mode (lower latency) |
| **Auto translation** | Automatically translate non-Chinese speech to Chinese via OpenAI-compatible API |
| **AI text formalization** | On-demand polishing of colloquial transcriptions into formal written text |
| **AI auto-summary** | Generate summaries after a configurable character threshold (default: 500 chars) |
| **Meta-summary** | Automatically generate a comprehensive summary after accumulating multiple summaries |
| **Export to note** | One-click export to Obsidian Markdown note; timestamp / AI-generated / manual title |
| **Persistent history** | Transcription history survives Obsidian restarts |
| **Cross-platform** | Fully compatible with macOS / Windows / Linux |

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

> If you use remotely-save, sync may overwrite `main.js` with an older version at the end of sync. Run this right after sync:
>
> ```bash
> npm run post-sync-refresh -- --vault "/path/to/your/vault" --vault-name "Your Vault Name"
> ```
>
> This command recopies plugin files and then forces plugin reload via Obsidian CLI (`plugin:reload`).

---

### Step 2: Install Python

> Skip this step if you already have Python 3.10–3.12.

**Check if Python is installed:**

```bash
# macOS / Linux
python3 --version

# Windows (Command Prompt or PowerShell)
python --version
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

A one-shot setup script is included in the `backend/` folder. **Run it once** — no manual pip commands needed.

#### macOS / Linux

Double-click `backend/setup.command` (macOS supports direct double-click), or run in terminal:

```bash
cd <your-vault>/.obsidian/plugins/realtime-transcription/backend
bash setup.command
```

#### Windows

Double-click `backend\setup.bat`, or run in Command Prompt:

```bat
cd <your-vault>\.obsidian\plugins\realtime-transcription\backend
setup.bat
```

The script automatically: creates a virtual environment → installs all dependencies → verifies the install → **prints the Python path you need for Step 5**.

> **Errors?** Make sure Python 3.10–3.12 is installed and your terminal has internet access.

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

Download each file **individually** into the same directory (all are standalone files, no extraction needed):

| File | Download Link | Size |
|------|---------------|------|
| `model.int8.onnx` | [HuggingFace](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx) · [Mirror (China)](https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx) | ~229 MB |
| `tokens.txt` | [HuggingFace](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt) · [Mirror (China)](https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt) | <1 MB |
| `silero_vad.onnx` | [GitHub](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx) | ~1.8 MB |

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

- `Python Path`: Enter your Python path
  - macOS / Linux: Enter `python3` (works in most cases)
  - Windows: Enter `python` (the plugin auto-detects this default)

  > If the default doesn't work, find the full Python path:
  > - macOS/Linux: Run `which python3` in terminal
  > - Windows: Run `where python` in Command Prompt, use the first result

  Path examples by OS:

  | OS | Python Path Example |
  |----|---------------------|
  | macOS (system Python) | `python3` or `/usr/local/bin/python3` |
  | macOS (virtual env, recommended) | `/Users/yourname/.../backend/venv/bin/python` |
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
| "Environment check failed, please run pip install..." | sherpa-onnx not installed | Follow Step 3 to install dependencies, then retry |
| "Environment check failed" but packages are installed | Used a venv but Python Path still points to system Python | Set Python Path to the venv path, e.g. `/path/to/backend/venv/bin/python` |
| No response, button stays gray | Python Path field is empty | Enter `python3` (macOS/Linux) or `python` (Windows) |
| "No such file or directory" | Python path is wrong | Run `which python3` (macOS/Linux) or `where python` (Windows) to get the correct path |
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

#### Windows Backend Throws NotImplementedError

If you encounter `NotImplementedError: add_signal_handler` on v1.0.2 or earlier, upgrade to v1.0.3+. This has been fixed.

#### macOS Security Warning on First Run

macOS may block unnotarized Python scripts with an "unidentified developer" alert:

1. Open **System Settings** → **Privacy & Security**
2. Scroll down to find the blocked item and click **Open Anyway**
3. Return to Obsidian and start recording again

---

### Security Notes

- Do **not** commit `data.json` (which contains API keys) to Git or share it with others
- On a new machine, re-enter API keys manually in plugin settings

### Cloud Billing Server

Hosted cloud mode uses `billing-server/`: the server keeps Tencent Cloud ASR credentials, the plugin logs in and requests a signed ASR URL, the server pre-charges balance, then settles by recording duration.

Minimal startup config:

```bash
export BS_SECRET_KEY="at least 32 random characters"
export TENCENT_APP_ID="Tencent Cloud AppID"
export TENCENT_SECRET_ID="Tencent Cloud SecretID"
export TENCENT_SECRET_KEY="Tencent Cloud SecretKey"
export AP_XUNHU_APPID="Xunhu AppID"
export AP_XUNHU_APPSECRET="Xunhu AppSecret"
export AP_XUNHU_NOTIFY_URL="https://your-domain/api/billing/callback/xunhu"
export BS_PRICE_PER_HOUR_CENTS=200

cd billing-server
pip install -r requirements.txt
python app.py
```

After deployment, set the plugin's Server URL to your HTTPS API domain.

### Contributing

Pull requests and issues are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a Pull Request

### License

MIT License — see [LICENSE](LICENSE) for details.
