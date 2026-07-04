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

## 2026-07-03 12:07 — AI 后端拆分为快速模型和智能模型

**背景**:用户要求 AI 配置清晰结构化,快速任务和分析任务可分别选择 API、Claude Code CLI、Codex CLI 或 OpenCode CLI。
**选择**:`aiBackend` 拆为 `fast` 与 `smart` 两个完整 profile;翻译/润色使用 `fast`,摘要/二次摘要/AI 命名使用 `smart`。
**备选**:继续使用一个全局 provider;为翻译、润色、摘要各自保留独立后端表单;只增加模型名字段不拆 provider。
**否决理由**:全局 provider 不能满足互不干扰;per-feature 表单会重复且用户已指出混乱;只拆模型名仍无法分别选择四种调用方式。
**影响范围**:`src/types.ts`,`src/main.ts`,`src/settings.ts`,`src/services/AgentBackendService.ts`,`tests/aiBackendConnection.test.ts`

## 2026-07-03 12:34 — 批量操作必须基于用户选中段落

**背景**:默认全选批量润色/翻译会把全部转写一次性提交给 AI,长转写场景 token 消耗不可控。
**选择**:撤下当前默认全选批量入口,等后续实现明确选中段落后再恢复批量操作。
**备选**:保留默认全选;弹确认框后全选执行;限制最近 N 条自动批量。
**否决理由**:默认全选和确认框都不能解决 token 规模不可见问题;最近 N 条与用户要求的“选中后执行”不一致。
**影响范围**:`src/views/TranscriptionView.ts`,`src/main.ts`,`src/i18n.ts`,`styles.css`,`tests/clearEntriesState.test.ts`

## 2026-07-03 21:08 — 云端充值改为浏览器账户中心

**背景**:Obsidian 插件没有内置商店/支付通道,插件内嵌充值状态也让设置页复杂且难维护。
**选择**:服务端新增 `/account` 账户中心;浏览器用 HttpOnly cookie 登录、充值、查订单和看用量;插件继续用 bearer token 调用云端转写 API。
**备选**:继续在插件设置页内创建充值订单;把插件登录也迁移到账户中心;引入第三方订阅平台 SDK。
**否决理由**:插件内支付 UI 增加复杂度且不如浏览器支付稳定;插件登录迁移需要 token handoff,本次不是必须;新 SDK 超出当前最小可用范围。
**影响范围**:`billing-server/auth.py`,`billing-server/payment_xunhu.py`,`billing-server/account_center.html`,`src/settings.ts`,`src/services/CloudAuthService.ts`

## 2026-07-04 01:33 — 云端账户使用 rt.songrong.org 子域名

**选择**:插件内置 `https://rt.songrong.org` 作为云端账户和计费 API 入口。
**备选**:使用 `https://songrong.org/rt` 或复用 `https://api.songrong.org`。
**否决理由**:主站路径会污染现有 Songrong 站点;`api.songrong.org` 已被 SongRong API 使用,不适合承载 Realtime Transcription 计费服务。
**影响范围**:`src/types.ts`,`src/main.ts`,`src/settings.ts`,`src/i18n.ts`,`tests/cloudAuthService.test.ts`

## 2026-07-04 13:37 — 市场版暂不开启云端付费入口

**选择**:保留云端代码,用 `HOSTED_CLOUD_ENABLED=false` 隐藏设置页入口和下拉选项,旧 `cloud` 配置自动回落本地模式。
**备选**:删除云端代码;继续公开云端托管选项但禁用账户中心;只删 README。
**否决理由**:删除代码会增加后续恢复成本;公开禁用入口仍会误导市场用户;只删 README 不能满足设置页不出现配置项。
**影响范围**:`src/types.ts`,`src/main.ts`,`src/settings.ts`,`README.md`,`README_EN.md`
