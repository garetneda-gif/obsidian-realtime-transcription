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

## 2026-07-01 14:25 — 准备 1.4.3 GitHub Release

**做了**:
- 将插件版本从 `1.4.1` 提升到 `1.4.3`
- 更新 `package.json`,`package-lock.json`,`manifest.json`,`versions.json`
- 按既有 release 资产格式准备 `main.js`,`manifest.json`,`styles.css`

**卡点**:
- mac mini 的 Git HTTPS 仍有 LibreSSL TLS 问题,GitHub push/release 改由 Air 本机执行

**下次接续**:
- 创建 tag `1.4.3` 并发布 GitHub Release
## 2026-07-01 15:59 — Security hotfix for Tencent ASR logs

- 已确认截图未显示 SecretID/SecretKey 明文。
- 已确认本机 vault `data.json` 保存凭据但未被 Git 跟踪。
- 已删除 Tencent ASR 签名阶段敏感调试日志。
- 下一步：构建、部署到本机 vault，并发布 `1.4.4`。
## 2026-07-01 16:09 — Fix English settings translation

- 用户指出英文 UI 仍混中文且 provider 下拉不需要括号内容。
- 已修复 `src/i18n.ts` 和 `src/settings.ts`，并按 Thino 参考改为分区设置页。
- 下一步：测试、构建、覆盖本机 vault，并发布 `1.4.5`。

## 2026-07-01 16:32 — Refine settings page layout

- 根据 Obsidian 内截图反馈，移除设置页标题下的副标题说明。
- 将“高级”合并进“通用”，左侧导航保留四个主项。
- ASR provider 切换改为先重绘再保存，避免下拉已变但内容区滞后。
- 右侧设置项增加内边距和文字/控件间距。
- 顶部栏和左侧分区栏改为 sticky，滚动设置内容时保持常驻。
- 左侧导航选中态覆盖 Obsidian 默认按钮 active/focus 样式，SVG 保持可见并变为强调色。
- README 拆分为中文 `README.md` 和英文 `README_EN.md`，语言切换改为文件链接。

## 2026-07-01 17:09 — Cloud account recharge MVP

- 云端账户充值按钮改为调用 `/api/billing/create-order`，创建虎皮椒订单后打开支付链接。
- 云端账户区新增服务器地址输入，便于切换到自部署 HTTPS API。
- 服务端支付金额改用 `Decimal`，限制充值范围，并在支付未配置时拒绝下单且不落脏订单。
- 新增 `billing-server/self_check.py`，覆盖注册、登录、未配置支付时拒绝下单。
- 已发布 `1.4.6`：功能分支提交 `5263d8a`，默认分支元数据提交 `67fb8a4`。

## 2026-07-01 17:23 — Compact settings sticky header

- 根据截图反馈重做设置页常驻顶部栏：顶部为长条标题，滚动后动画折叠为麦克风 SVG 小按钮。
- 修复圆角标题条遮挡关闭按钮和右侧下拉控件的问题。
- 更新发布元数据到 `1.4.7`，已构建并覆盖本机插件目录。
## 2026-07-02 01:56 — 云账户客户端流程可用化
- 当前会话在 MacBook Air，分支 `feat/claudian-direct-context`，仅处理前端云账户/充值状态切片。
- 已实现服务端地址归一化、账户查询 `/api/billing/me` 到 `/api/billing/balance` 回退、订单状态查询和主动刷新。
- 设置页已登录状态支持刷新余额、创建充值订单、打开支付页、手动检查订单、退出登录。
- 验证：`node --experimental-strip-types --test tests/cloudAuthService.test.ts`、`node --experimental-strip-types --test tests/*.test.ts`、`npm run build` 均通过。

## 2026-07-02 02:02 — 计费服务运行层配置硬化
- 当前会话在 MacBook Air，分支 `feat/claudian-direct-context`，仅处理 billing server 部署配置/健康检查切片。
- 已新增生产配置校验、CORS origins 配置、`/healthz`、`/readyz`、SQLite 外键 pragma 和结算循环禁用开关。
- 已补 `billing-server/tests/test_config.py` 与 `billing-server/self_check.py` 健康检查覆盖。
- 验证：`cd billing-server && .venv311/bin/python -m pytest tests/test_config.py tests/test_auth.py tests/test_payment.py -q && .venv311/bin/python self_check.py` 通过。
## 2026-07-02 02:39 — 硬化云端 ASR 预扣和结算
- 接管子代理未完成的 ASR 计费切片，完成签名预扣、签名失败回滚、用量报告幂等和过期结算幂等。
- 新增 `/api/billing/me`，前端云账户可直接读取邮箱和余额。
- 验证：`cd billing-server && .venv311/bin/python -m pytest tests -q` 25 passed；`node --experimental-strip-types --test tests/*.test.ts` 26 passed；`npm run build` 通过。
