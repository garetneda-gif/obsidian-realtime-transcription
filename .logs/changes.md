# 变更清单

> 每次 git commit 前追加。说明动了哪些文件、为什么动。
> 与 commit message 互补:commit 说"做了什么",这里说"为什么这么改"。

## 模板

```markdown
## YYYY-MM-DD HH:MM — <一句话变更主题>

**新增**:`path/a.py`,`path/b.md`
**修改**:`path/c.py:42-58`(原因:...)
**删除**:`path/d.py`(原因:已被 X 取代)
**关联 commit**:<sha 或 PR 链接>
```

---

<!-- 在下面追加新变更 -->

## 2026-07-01 09:50 — 兼容 Responses API 摘要响应

**新增**:`src/utils/llmResponse.ts`,`tests/llmResponse.test.ts`
**修改**:`src/services/SummaryService.ts`,`src/services/FormalizeService.ts`,`src/services/TranslationService.ts`(原因:复用同一个 LLM 响应解析器,兼容 Chat/Legacy/Responses API)
**删除**:三个服务内重复的本地 `extractTextFromResponse` 实现(原因:已被共享 helper 取代)
**关联 commit**:待提交

## 2026-07-01 10:13 — 清空记录时重置摘要上下文

**新增**:`tests/clearEntriesState.test.ts`
**修改**:`src/main.ts`(原因:清空记录时同步清掉摘要缓冲、二次摘要队列、待提交转写和 partial 状态)
**删除**:无
**关联 commit**:待提交

## 2026-07-01 11:28 — 增加复制全部记录到剪切板

**新增**:`src/utils/transcriptFormatter.ts`,`tests/transcriptFormatter.test.ts`
**修改**:`src/main.ts`,`src/views/TranscriptionView.ts`,`src/i18n.ts`(原因:新增复制按钮,复用导出 Markdown 格式写入剪切板)
**删除**:`src/main.ts` 内已被 formatter 取代的 `formatTime()` 方法
**关联 commit**:待提交

## 2026-07-01 12:54 — direct-context 交给 Claudian

**新增**:`src/utils/claudianContext.ts`,`src/utils/obsidianCommands.ts`,`tests/claudianContext.test.ts`
**修改**:`src/main.ts`,`src/views/TranscriptionView.ts`,`src/i18n.ts`(原因:新增“交给 Claudian”按钮,将当前转写写入稳定上下文文件并挂入 Claudian external contexts)
**删除**:无
**关联 commit**:待提交

## 2026-07-01 14:05 — 配置复制记录与 Claudian 提示词

**新增**:无
**修改**:`src/types.ts`,`src/settings.ts`,`src/i18n.ts`,`src/main.ts`,`src/utils/claudianContext.ts`,`src/views/TranscriptionView.ts`,`styles.css`,`tests/claudianContext.test.ts`(原因:复制按钮支持按内容/范围筛选,Claudian 提示词支持自定义,上下文文件改入隐藏插件目录,删除按钮改为透明红色图标)
**删除**:无
**关联 commit**:待提交

## 2026-07-01 14:25 — 发布 1.4.3

**新增**:无
**修改**:`package.json`,`package-lock.json`,`manifest.json`,`versions.json`(原因:当前 GitHub 最新 release 为 `1.4.2`,新 release 需要唯一版本号 `1.4.3`)
**删除**:无
**关联 commit**:待提交
## 2026-07-01 15:59 — Remove Tencent credential debug logs

- 删除 `src/services/TencentASRClient.ts` 中签名阶段的凭据/签名调试输出。
- 更新发布元数据到 `1.4.4`。
## 2026-07-01 16:09 — Complete English Tencent settings copy

- 去掉 ASR provider 选项中的括号说明。
- 腾讯云设置区标题、说明、AppID、Secret、引擎模型接入 i18n。
- 引擎模型下拉去掉模型代码后缀。
- 设置页改为 Thino 式左侧分区导航、右侧详情区。
- 新增设置页分区样式。
- 更新发布元数据到 `1.4.5`。

## 2026-07-01 16:32 — Tighten settings page visual hierarchy

- 修改 `src/settings.ts`：删除顶部副标题；将高级设置归入通用分区；provider 切换先刷新界面再保存。
- 修改 `src/i18n.ts`：删除不再使用的设置页副标题和高级导航文案。
- 修改 `styles.css`：增大右侧设置项内边距和文字/控件间距；顶部栏和左侧分区栏改为 sticky 常驻。
- 修改 `styles.css`：选中导航项覆盖默认 active/focus 背景，SVG 图标使用强调色且不消失。
- 新增 `README_EN.md`，`README.md` 改为中文文档；语言切换从同页锚点改为跨文件链接。
