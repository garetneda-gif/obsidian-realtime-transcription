# 项目档案 — obsidian-realtime-transcription

> 本目录是 .logs/ 日志系统,记录项目决策/进度/错误/变更。
> 详见 AGENTS.md "项目启动 SOP — 先建日志系统"。

## 项目快照

- **目的**:Obsidian 实时语音转写插件,支持本地/腾讯云 ASR 与 OpenAI 兼容 API 后处理
- **技术栈**:TypeScript,Obsidian Plugin API,esbuild,Node.js,Python 后端
- **入口**:`src/main.ts`,`main.js`
- **如何跑**:`npm run build`;测试:`node --experimental-strip-types --test tests/**/*.test.ts`
- **外部依赖**:Obsidian,OpenAI 兼容 LLM API,腾讯云 ASR,本地 Python ASR 后端
- **凭据位置**:Obsidian 插件设置页/本地配置,不写入仓库

## 文件索引

| 文件 | 职责 |
|---|---|
| `decisions.md` | 架构/方案决策(ADR 精简版) |
| `progress.md` | 会话级进度流水 |
| `errors.md` | 遇到的错误 + 根因 + 解决 |
| `changes.md` | 关键变更清单(commit 前追加) |

## 维护约定

- 条目以 `## YYYY-MM-DD HH:MM — <主题>` 起始
- 主体 2-5 行要点,禁意识流
