## 2026-07-01 15:52 — Default branch manifest lagged release

- 现象：GitHub Release `1.4.3` 已存在，但默认分支 `manifest.json` 仍为 `1.4.2`。
- 影响：Obsidian 市场根据仓库 `manifest.json` 判断最新版本时可能继续看到旧版本。
- 处理：同步 `package.json`、`package-lock.json`、`manifest.json`、`versions.json` 到 `1.4.3`。

## 2026-07-18 17:20 — Public pricing test missing Flask locally

- `python3 -m unittest ...` 的 22 个静态测试通过，新测试在导入时失败：`ModuleNotFoundError: No module named 'flask'`。
- 根因是当前 worktree 没有虚拟环境，系统 `/usr/bin/python3` 未安装 `billing-server/requirements.txt`；代码尚未进入执行阶段。
- 后续使用独立虚拟环境安装仓库依赖后重跑，不修改系统 Python。

## 2026-07-18 17:27 — Branded support mailbox could not be verified

- `songrong.org` 的 MX 已指向 Cloudflare Email Routing，但 Air 浏览器没有 Cloudflare 登录态。
- 对三个 Cloudflare MX 的仅 RCPT 探测均在 SMTP 握手时被远端关闭，无法确认 `support@songrong.org` 是否已配置。
- 在实际验证可收信前不把网站邮箱改成该地址，也不勾选 Creem 的审核合规声明。
## 2026-07-18 20:13 — Vercel v6 deployment-file endpoint retired

- 复现：`vercel api /v6/deployments/<id>/files/<uid>` 返回 HTTP 410，提示改用 v8。
- 根因：Vercel 已停用该 endpoint 的 v6 版本。
- 解决：改用 `/v8/deployments/<id>/files/<uid>`，再从 JSON 的 Base64 `data` 字段解码文件内容。

## 2026-07-18 20:21 — Vercel Preview curl requires explicit confirmation flag

- 复现：并行执行 `vercel curl ... --deployment <preview>` 时退出码为 1，提示需要确认。
- 根因：目标 Preview 尚未链接到当前工作树，CLI 的无交互模式仍要求显式确认。
- 解决：在只读冒烟请求中加入 `--yes` 后重试。

## 2026-07-18 20:22 — Vercel curl auto-linked the worktree to the wrong project

- 复现：在未链接的 worktree 加 `--yes` 后，CLI 按目录名新建并链接了 `obsidian-realtime-transcription-creem-review`，请求因错误项目的保护令牌返回 302。
- 根因：`vercel curl` 的 `--deployment` 不会替代本地项目链接；`--yes` 同时允许自动链接。
- 解决：将本地 `.vercel/project.json` 明确指向既有目标项目 `prj_aeHKrl0mifykaQo9A6nBFkIde9Fo` 后再做只读冒烟；未对生产域名做任何切换。

## 2026-07-18 20:25 — Vercel logs positional deployment implies follow mode

- 复现：`vercel logs --deployment <url> --level error --limit 50` 报错称 follow 模式不支持过滤。
- 根因：指定部署时 CLI 默认开启实时跟随。
- 解决：改用部署 URL 作为位置参数并加 `--no-follow`；Preview 未发现 error 日志。
## 2026-07-18 22:06 — Frontend verification missing worktree dependencies

- 现象：`npm test` 报缺少 `ws`，`npm run typecheck` 报 `tsc: command not found`。
- 根因：当前独立 worktree 尚未安装 `node_modules`，与本次品牌文案改动无关。
- 处理：按 `package-lock.json` 执行 `npm ci`，完成后重新运行前端测试与类型检查。
- 结果：依赖安装完成；前端 50 项测试、类型检查与生产构建全部通过。

## 2026-07-18 22:35 — Creem disabled storefront alias did not persist

- 现象：将商店别名改为 `realtime-transcriber` 后页面提示保存成功，但刷新仍恢复原内部别名。
- 影响：公共商店前台处于禁用状态；商店显示名、商品名、站点品牌和审核资料均已完成改名，客户界面不显示该别名。
- 处理：保留现状，避免绕过 Creem 控制台或改变审核中的商店标识；后续如启用公共前台，再联系 Creem 支持处理别名。
