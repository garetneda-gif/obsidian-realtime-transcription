## 2026-07-01 15:52 — Default branch manifest lagged release

- 现象：GitHub Release `1.4.3` 已存在，但默认分支 `manifest.json` 仍为 `1.4.2`。
- 影响：Obsidian 市场根据仓库 `manifest.json` 判断最新版本时可能继续看到旧版本。
- 处理：同步 `package.json`、`package-lock.json`、`manifest.json`、`versions.json` 到 `1.4.3`。
