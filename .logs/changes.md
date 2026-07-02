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

## 2026-07-01 17:09 — Cloud billing recharge MVP

- 修改 `src/services/CloudAuthService.ts`：新增创建充值订单 API。
- 修改 `src/settings.ts`,`src/i18n.ts`：云端账户显示服务器地址，充值按钮创建订单并打开支付页。
- 修改 `billing-server/payment_xunhu.py`：充值金额使用 `Decimal`，校验金额区间，支付未配置时不创建订单。
- 新增 `billing-server/self_check.py`：最小注册/登录/下单拒绝自检。
- 修改 `README.md`,`README_EN.md`：补云端收费服务启动配置。
- 更新发布元数据到 `1.4.6`，并发布 GitHub Release `1.4.6`。

## 2026-07-01 17:23 — Realtime Transcription 1.4.7 header polish

- 修改 `src/settings.ts`,`styles.css`：设置页顶部栏在顶部显示长条标题，滚动后动画折叠为与侧边栏同宽的麦克风图标栏。
- 修复顶部栏遮挡关闭按钮和右侧下拉控件的问题。
- 更新 `manifest.json`,`package.json`,`package-lock.json`,`versions.json` 到 `1.4.7`。
## 2026-07-02 01:56 — 完成云账户前端状态切片
- `src/services/CloudAuthService.ts`: 统一 `buildUrl` URL 归一化，新增 `/api/billing/me` 回退、订单查询和订单刷新方法。
- `src/settings.ts`: 云端托管登录态显示服务器地址、余额、刷新余额、充值、检查订单和退出登录。
- `src/i18n.ts`: 补齐云账户/订单状态中英文文案，避免英文界面残留中文。
- `tests/cloudAuthService.test.ts`: 新增 URL、账户回退、充值订单和刷新错误提取单测。

## 2026-07-02 02:02 — 硬化 billing server 部署运行层
- `billing-server/config.py`: 新增 `validate_config()`、生产密钥/必填项/范围校验，以及 `BS_PUBLIC_SERVER_URL`、`BS_CORS_ORIGINS`、`AP_XUNHU_QUERY_URL`、`BS_DISABLE_SETTLEMENT_LOOP` 配置。
- `billing-server/app.py`: 新增 `/healthz`、`/readyz`，启动时校验生产配置，并支持禁用后台结算循环。
- `billing-server/database.py`: SQLite 连接启用 `PRAGMA foreign_keys=ON`。
- `billing-server/payment_xunhu.py`: 支付查询 URL 改为读取 `config.XUNHU_QUERY_URL`。
- `billing-server/self_check.py`,`billing-server/tests/test_config.py`: 覆盖健康检查、readyz、生产缺省密钥失败和开发环境宽松校验。
- `README.md`,`README_EN.md`: 补充云端计费服务最小部署环境变量和自检命令。
## 2026-07-02 02:39 — ASR 计费结算可用化
- `billing-server/signing.py`：增加云端 ASR 模型白名单，签名 URL 生成成功后才提交预扣事务，失败直接 rollback。
- `billing-server/billing.py`：新增账户接口，强化用量报告输入校验、退款幂等、重复报告返回已结算结果。
- `billing-server/database.py` / `billing-server/models.py`：为 `usage_records.sign_request_id` 补唯一约束和启动迁移检查，避免重复结算记录。
- `billing-server/tests/test_billing.py`：覆盖账户、预扣、余额不足、签名失败回滚、重复报告、过期结算和唯一索引。

## 2026-07-02 09:32 — 转写区域改为文本流
- `styles.css`: 普通转写条目去掉背景、边框、圆角和阴影,改为透明文本流。
- `styles.css`: 普通转写 footer 改为绝对定位,不再占文本流高度。
- `src/views/TranscriptionView.ts`: 润色按钮改为 `aria-label/title + SVG` 状态,不再显示矩形文字按钮。
- `styles.css`: 润色按钮背景、边框、阴影改为透明,仅保留悬停/加载/完成图标色。
- `src/views/TranscriptionView.ts`: 润色加载态从魔杖自转改为圆形 loader 转圈。
- `styles.css`: footer 在 `focus-within` 时显示,避免键盘焦点落到不可见按钮。
- `styles.css`: 保留摘要/二次摘要的结构化样式,避免摘要与普通原文混在一起。

## 2026-07-02 09:57 — 转写面板快捷设置与手动翻译
- `src/views/TranscriptionView.ts`,`styles.css`: 条目操作区新增手动翻译按钮,翻译/润色成功勾 2 秒后恢复为原 SVG。
- `src/main.ts`,`src/types.ts`,`src/i18n.ts`: 垃圾桶旁新增设置按钮,弹窗支持转写字号和 AI 返回语言。
- `src/services/SummaryService.ts`,`src/services/TranslationService.ts`,`src/services/FormalizeService.ts`: 摘要、翻译、润色共享返回语言,且不再传 `max_tokens`。
- `tests/clearEntriesState.test.ts`: 更新摘要调用签名断言。

## 2026-07-02 10:12 — 覆盖式面板设置与加载动效
- `src/views/TranscriptionView.ts`,`styles.css`: 设置按钮移到垃圾桶左侧,改为覆盖插件首页的设置页,顶部提供返回和保存 SVG 按钮。
- `src/main.ts`,`src/types.ts`,`src/i18n.ts`: 面板设置新增自动触发翻译、自动触发润色,自动翻译复用 `translation.enabled`,自动润色新增 `autoFormalize`。
- `styles.css`: `翻译中...` 和 `正在润色...` 文案新增 shimmer loading 效果。
- `styles.css`: 设置页返回/保存按钮去掉默认按钮底色、边框和阴影,保持与其他 SVG 按钮一致。

## 2026-07-02 10:24 — 修正语言标签和设置页布局
- `src/main.ts`: 语言标签优先按实际转写文本脚本判断,再用识别模式兜底,避免英文内容被标成中文。
- `tests/clearEntriesState.test.ts`: 增加语言判断顺序静态检查。
- `src/settings.ts`,`styles.css`: 设置页紧凑标题同时显示麦克风 SVG 和 `Realtime-Transcription`。
- `styles.css`: 面板设置行改为纵向分组,避免标题/说明被挤压和滑动条溢出。
- `styles.css`: 设置页紧凑标题宽度恢复与左侧导航栏一致,隐藏版本号并缩小标题防止撑宽。
- `src/settings.ts`: 重绘设置页前先读取滚动位置并初始化标题宽度,避免切换分区时标题条跳动。
- `src/views/TranscriptionView.ts`,`styles.css`: 自动翻译/自动润色开关改为与左侧标题同一行。
- `styles.css`: 设置页顶部返回/保存 SVG 统一强调色并补 hover 效果。
- `styles.css`: 设置页紧凑标题去掉省略号,在侧栏宽度内完整显示 `Realtime-Transcription`。

## 2026-07-02 10:55 — 润色覆盖原文与加载动效修正
- `src/views/TranscriptionView.ts`: 润色结果直接覆盖原文区域显示,继承原文字号; 润色按钮在已有结果时切换显示原文/润色。
- `src/i18n.ts`: 新增显示原文/显示润色按钮文案。
- `styles.css`: 翻译/润色加载文案改为文字伪元素 shimmer,并移除独立润色文本样式。
- `styles.css`: 设置页标题图标和文字行改为垂直居中。

## 2026-07-02 11:11 — 历史转写语言标签按内容推断
- `src/views/TranscriptionView.ts`: 渲染语言标签时按文本内容重新判断中英日韩,旧记录英文内容不再因持久化语言码显示为中文。
- `src/views/TranscriptionView.ts`: 手动翻译源语言改用同一推断结果,避免旧英文记录按中文发起翻译。
- `styles.css`: 将翻译/润色加载 shimmer 调慢并扩大高光过渡区域,降低闪烁和卡顿感。
- `tests/clearEntriesState.test.ts`: 增加视图层语言推断和手动翻译调用路径的静态回归检查。

## 2026-07-02 11:25 — 修复开始录制时后端启动误报
- `src/main.ts`: 录制开关增加启动/停止互斥,避免连续触发时并发启动互相终止后端。
- `src/services/BackendManager.ts`: 启动前先复用已可连接的本地后端,避免插件重载后先杀健康残留进程。
- `src/services/BackendManager.ts`: 后端进程退出日志补充 signal,避免真实崩溃时只看到 `退出码:null`。
- `tests/clearEntriesState.test.ts`: 增加录制互斥和后端复用顺序的静态回归检查。

## 2026-07-02 11:32 — 重新翻译时覆盖旧译文
- `src/views/TranscriptionView.ts`: 手动翻译再次触发时先移除旧译文并清空当前条目译文状态,加载占位直接顶替旧译文。
- `tests/clearEntriesState.test.ts`: 增加重新翻译先清旧译文再插入 loading 的静态回归检查。
