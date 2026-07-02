# 错误档案

> 遇错即写,不等解决。包含错误信息、根因、解决方案、复现步骤。

## 模板

```markdown
## YYYY-MM-DD HH:MM — <错误主题>

**症状**:报错信息或异常行为
**触发**:执行 X 命令时出现 / 改 Y 文件后
**根因**:<分析,可后补>
**解决**:<具体动作,引用 commit hash 或文件:行号>
**复现**:执行 ... 即可重现 / 已无法复现
```

---

## 2026-07-01 09:45 — 摘要 API 返回格式不受支持

**症状**:Obsidian 插件摘要失败,提示 API 返回格式不受支持
**触发**:`SummaryService` 调用 OpenAI 兼容 API 后只解析 Chat/Legacy Completions 响应
**根因**:解析器未兼容 Responses API 的 `output_text` 与 `output[].content[].text` 格式
**解决**:新增共享解析器 `src/utils/llmResponse.ts`,并让摘要/润色/翻译服务复用
**复现**:`node --experimental-strip-types --test tests/llmResponse.test.ts` 覆盖新旧格式

## 2026-07-01 09:48 — 临时 TypeScript 检查发现既有类型错误

**症状**:`npx tsc --noEmit --outDir /tmp/obsidian-realtime-transcription-typecheck` 报 `src/views/TranscriptionView.ts(115,21): Property 'commands' does not exist on type 'App'`
**触发**:为本次改动额外执行 TypeScript 静态检查
**根因**:既有代码使用 Obsidian 运行时字段,当前类型定义未声明该字段
**解决**:本次未改该文件;`npm run build` 与运行测试均通过
**复现**:在仓库根执行上述 `npx tsc` 命令

## 2026-07-01 09:57 — Obsidian CLI reload 未返回可靠完成信号

**症状**:`obsidian plugin:reload id=realtime-transcription` 启动桌面进程后持续运行,并打印更新检查 SSL 报错
**触发**:构建产物复制到 vault 插件目录后尝试自动重载插件
**根因**:当前 Obsidian 可执行文件以前台桌面进程方式运行,不是可靠的一次性 reload CLI
**解决**:已中断前台命令;插件文件已覆盖,需在 Obsidian 内重载插件或重启应用
**复现**:在 mac mini 上执行上述 `obsidian plugin:reload` 命令

## 2026-07-01 10:12 — 清空后下一次摘要仍包含旧内容

**症状**:点击清空记录后,下一次自动摘要仍会带上清空前的转写内容
**触发**:清空 UI/历史记录后继续录音并触发摘要阈值
**根因**:`clearEntries()` 只清 `transcriptEntries` 和持久化文件,未清 `summaryBuffer`、`metaSummaryTexts`、待 flush 转写和在途摘要请求
**解决**:清空时调用 `resetTransientTranscriptState()`,并用 `transcriptSessionVersion` 丢弃清空前返回的摘要/二次摘要
**复现**:`node --experimental-strip-types --test tests/clearEntriesState.test.ts`
## 2026-07-01 15:59 — Tencent ASR debug logs exposed credential fragments

- 根因：签名构建阶段打印 SecretID 前缀、SecretKey 前缀、签名原文和签名结果。
- 风险：截图未暴露密钥，但分享 Obsidian 开发者控制台日志时可能泄露可重构的临时签名请求。
- 解决：移除敏感调试日志，保留实际签名逻辑。

## 2026-07-02 11:25 — 开始录制时报后端启动失败退出码 null

**症状**:点击开始录制时弹出 `后端启动失败（退出码:null）`
**触发**:本地 ASR 模式下录制开关可能在启动完成前被再次触发,或插件重载后已有健康后端残留
**根因**:`toggleRecording()` 没有启动/停止互斥;`BackendManager.start()` 在复用可达后端前先清理孤儿进程,容易把刚启动或健康残留的后端终止
**解决**:`src/main.ts` 增加 `recordingTransition`;`src/services/BackendManager.ts` 启动前先复用可达后端并在退出日志带上 signal
**复现**:连续触发录制开关或保留 `backend.pid` 后重载插件再开始录制

## 2026-07-02 16:22 — Codex CLI 模式仍报 API/unknown option 错误

**症状**:Codex CLI 模式下摘要/翻译/润色提示 `401 Invalid authentication credentials` 或 `unknown option '--sandbox'`
**触发**:设置页切到 Codex CLI 后保留旧 `aiBackend.cliPath=/Users/jikunren/.npm-global/bin/claude`,或额外参数含 Codex 不支持的 flag
**根因**:命令构造在 resolver 找不到时仍回退使用旧显式路径;provider 切换也只在路径为空时自动检测
**解决**:`src/services/AgentBackendService.ts` 增加 provider/path 兼容判断并过滤 Codex 不兼容参数;`src/main.ts` 和 `src/settings.ts` 在加载/切换时自动改到当前 provider 的 CLI
**复现**:将 `aiBackend.provider=codex` 且 `aiBackend.cliPath` 指向 `claude`,点击测试连接或触发摘要即可复现

## 2026-07-02 16:22 — CLI 摘要失败通知刷屏

**症状**:CLI 模式摘要失败时连续弹出多条 `AI 摘要失败`
**触发**:摘要请求失败后 `summaryBuffer` 未消耗,`maybeRunSummary()` 在 finally 中立即再次满足阈值
**根因**:失败路径没有退避窗口,API 模式曾修过但 CLI 模式复用同一触发器后仍会连续重试
**解决**:`src/main.ts` 增加 `summaryRetryAfter` 和 `metaSummaryRetryAfter`,失败后 60 秒内不再重复触发
**复现**:配置不可用本地 CLI 并让转写缓冲超过摘要阈值

## 2026-07-02 18:50 — 面板设置字号压缩后测试仍断言旧尺寸

**症状**:`node --experimental-strip-types --test tests/*.test.ts` 中 `panel settings expose custom AI output language and wrapped select arrow` 失败
**触发**:将面板 select padding 从旧尺寸压缩为 `padding: 0 34px 0 10px`
**根因**:静态测试仍写死旧的 `padding: 0 40px 0 12px` 和 `right: 14px`
**解决**:更新断言为新的紧凑尺寸,并补 `font-size: 13px` 检查
**复现**:回退 `tests/clearEntriesState.test.ts` 中 select 尺寸断言后运行测试

## 2026-07-02 18:50 — 旧综合摘要 badge 渐变残留

**症状**:摘要框改为透明左线设计后,测试仍发现旧 `linear-gradient(135deg, rgba(124, 58, 237...` 字符串
**触发**:全量测试校验摘要不再使用紫蓝卡片渐变
**根因**:`.card-lang-badge.lang-meta-summary` 遗留旧渐变样式,虽然新摘要头部不再使用该 badge
**解决**:将该 badge 改为透明背景和普通 muted 文本色
**复现**:`rg "linear-gradient\\(135deg, rgba\\(124, 58, 237" styles.css`

## 2026-07-02 21:14 — 自绘转写字号滑条无法拖动

**症状**:右侧转写设置页的字号滑条视觉显示正常,但用户侧无法拖动
**触发**:将原生 range 隐藏为自绘滑条后,透明输入层没有稳定接收拖拽路径
**根因**:视觉层和交互层分离后,只依赖单一事件路径容易在 Electron/macOS 鼠标事件下丢失拖动
**解决**:`src/views/TranscriptionView.ts` 使用透明原生 range 接收交互,外层同时监听 PointerEvent 和 MouseEvent 兜底,并用 ResizeObserver 保持进度与滑块对齐
**复现**:打开转写设置页,拖动 `转写字号` 滑条,观察数值和滑块是否随鼠标变化
