# 决策档案

> ADR 精简版。每次做不可逆决策后立刻追加。

## 模板

```markdown
## YYYY-MM-DD HH:MM — <一句话决策主题>

**背景**:为什么需要做这个决策(1-2 行)
**选择**:最终选了什么
**备选**:还考虑过什么(列表,2-4 项)
**否决理由**:为什么不选备选
**影响范围**:动了哪些模块/文件
```

---

## 2026-07-02 16:22 — CLI provider 切换只纠正已知命令错配

**背景**:用户在 Codex CLI 模式下仍保留 Claude CLI 路径,导致调用路径和 provider 不一致。
**选择**:仅当 `cliPath` basename 是 `claude`、`codex`、`opencode` 且与 provider 不匹配时自动改为当前 provider 检测路径。
**备选**:每次切换 provider 都无条件覆盖路径;忽略显式路径只用默认命令;为每个 provider 保存独立路径字段。
**否决理由**:无条件覆盖会破坏用户自定义 wrapper;只用默认命令无法支持手动路径;独立字段改动面更大且当前问题不需要。
**影响范围**:`src/services/AgentBackendService.ts`,`src/main.ts`,`src/settings.ts`,`tests/aiBackendConnection.test.ts`

## 2026-07-02 18:50 — 摘要内容采用透明左线块

**背景**:用户提供摘要框设计图,要求不要沿用旧卡片感,并希望摘要区有清晰标题和操作入口。
**选择**:摘要和综合摘要统一为透明内容块,左侧用细强调线区分,头部放标题、复制、重新生成和折叠 SVG 操作。
**备选**:继续保留卡片背景;只改标题不改容器;把操作按钮放在底部。
**否决理由**:卡片背景与设计图不一致;只改标题无法解决视觉脱节;底部操作会增加阅读后跳动和占位。
**影响范围**:`src/views/TranscriptionView.ts`,`styles.css`,`src/main.ts`,`src/types.ts`
