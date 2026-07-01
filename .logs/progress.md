# 进度流水

> 每会话结束前追加。重点:本次做了什么、卡在哪、下次从哪接。

## 模板

```markdown
## YYYY-MM-DD HH:MM — <一句话主题>

**做了**:
- 完成 X(`path/to/file.py:42`)
- 跑通 Y 测试

**卡点**:
- Z 待解决,涉及 ...

**下次接续**:
- 先做 ...
- 再处理 ...
```

---

<!-- 在下面追加新进度 -->

## 2026-07-01 09:24 — 建立日志系统

**做了**:
- 创建 `.logs/README.md`,`decisions.md`,`progress.md`,`errors.md`,`changes.md`
- 记录项目入口、构建命令与外部依赖

**卡点**:
- 无

**下次接续**:
- 定位摘要 API 格式不兼容的解析路径并修复

## 2026-07-01 09:52 — 修复摘要响应格式兼容

**做了**:
- 新增共享 LLM 响应解析器,支持 Chat Completions、Legacy Completions 与 Responses API
- 摘要、总摘要、标题生成、润色、翻译共用同一解析路径
- 跑通 `node --experimental-strip-types --test tests/*.test.ts` 与 `npm run build`

**卡点**:
- `npx tsc --noEmit` 受既有 `tsconfig.json`/`TranscriptionView.ts` 类型问题影响,已记录到 `errors.md`

**下次接续**:
- 如需完全静态类型通过,单独修复 `src/views/TranscriptionView.ts` 的 Obsidian `App.commands` 类型声明

## 2026-07-01 10:14 — 修复清空后摘要残留

**做了**:
- `clearEntries()` 增加临时状态重置,清掉摘要缓冲和二次摘要队列
- 摘要/二次摘要请求增加 session version 保护,清空前返回的旧结果不再写入
- 跑通 `tests/clearEntriesState.test.ts`、完整 `tests/*.test.ts` 和 `npm run build`

**卡点**:
- GitHub push 仍受 TLS/SSL 连接问题影响,待最后处理

**下次接续**:
- 提交第二个修复并解决远端推送

## 2026-07-01 11:29 — 增加复制全部转录记录功能

**做了**:
- 侧边栏控制栏新增复制按钮,点击后复制当前面板全部记录
- 导出和复制共用 `formatTranscriptEntriesAsMarkdown()` 输出格式
- 跑通 `tests/transcriptFormatter.test.ts`、完整 `tests/*.test.ts` 和 `npm run build`

**卡点**:
- 自动 reload Obsidian CLI 不可靠,已直接同步 `main.js` 到 vault 插件目录

**下次接续**:
- 在 Obsidian 内重载插件后验证复制按钮写入剪切板

## 2026-07-01 12:54 — 实现 direct-context Claudian 对接

**做了**:
- 新增“交给 Claudian”按钮,点击后写入 `Claudian/实时转写上下文/current.md`
- 自动打开 `realclaudian:open-view`,并把上下文目录加入 Claudian external contexts
- selector 不可用时 fallback 复制当前转写 Markdown 到剪切板
- 跑通 `node --experimental-strip-types --test tests/*.test.ts`,`npm run build`,`npx tsc --noEmit --outDir /tmp/obsidian-realtime-transcription-claudian-typecheck`

**卡点**:
- 实现子代理启动后未完成代码,主线程接管实现;已继续派只读审查子代理复核

**下次接续**:
- 同步 `main.js` 到实际 vault 插件目录,在 Obsidian 内重载插件后手动验证按钮

## 2026-07-01 14:05 — 增加复制与 Claudian 交接设置

**做了**:
- 复制按钮新增“全部内容/仅摘要”和“全部记录/最近 1 条”设置
- Claudian 交接提示词改为可配置模板,并把上下文文件改写到隐藏插件目录
- 删除按钮 hover/focus/active 状态改为仅显示红色 SVG,无方块背景
- 根据只读审查反馈,Claudian 多面板时分别查找可用 selector/input,删除按钮保留键盘焦点描边
- 跑通 `node --experimental-strip-types --test tests/*.test.ts`,`npx tsc --noEmit --outDir /tmp/obsidian-realtime-transcription-claudian-typecheck`,`npm run build`
- 已部署到 `/Users/jikunren/笔记/大二下笔记/.obsidian/plugins/realtime-transcription`

**卡点**:
- Obsidian 设置侧栏自动化不稳定,已用构建产物和主面板截图确认插件加载

**下次接续**:
- 如需视觉确认设置页,在 Obsidian 设置中进入“文字转写”插件配置页查看新增分组
