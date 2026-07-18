## 2026-07-01 15:52 — Do not resubmit marketplace PR

**选择**：不重新向 `obsidianmd/obsidian-releases` 提交插件收录 PR。

**备选**：重复提交 `community-plugins.json` 条目。

**否决理由**：上游 `community-plugins.json` 已包含 `realtime-transcription`，重复提交只会制造无效 PR；当前需修正的是本仓库默认分支的版本元数据。

## 2026-07-18 17:25 — Preserve the live Vercel source baseline

**选择**：从生产部署 `dpl_9SkBWyFcvrurhcAv6XEYPHwcytHx` 恢复 `legal_pages.py`，并以冻结的生产 `src` manifest 叠加公开定价改动；只用该 manifest 做 Preview 与后续提升。

**备选**：直接从落后的 GitHub `main` 运行 `vercel --prod`，或整站重写法律页。

**否决理由**：当前生产有未回灌 Git 的法律页、认证和静态资源改动；从 `main` 重部署会回滚线上功能，重写法律页会造成不必要的政策变化。
