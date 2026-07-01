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
