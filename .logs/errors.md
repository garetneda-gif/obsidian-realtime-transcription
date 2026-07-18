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
