## 2026-07-01 15:52 — Do not resubmit marketplace PR

**选择**：不重新向 `obsidianmd/obsidian-releases` 提交插件收录 PR。

**备选**：重复提交 `community-plugins.json` 条目。

**否决理由**：上游 `community-plugins.json` 已包含 `realtime-transcription`，重复提交只会制造无效 PR；当前需修正的是本仓库默认分支的版本元数据。

## 2026-07-18 17:25 — Preserve the live Vercel source baseline

**选择**：从生产部署 `dpl_9SkBWyFcvrurhcAv6XEYPHwcytHx` 恢复 `legal_pages.py`，并以冻结的生产 `src` manifest 叠加公开定价改动；只用该 manifest 做 Preview 与后续提升。

**备选**：直接从落后的 GitHub `main` 运行 `vercel --prod`，或整站重写法律页。

**否决理由**：当前生产有未回灌 Git 的法律页、认证和静态资源改动；从 `main` 重部署会回滚线上功能，重写法律页会造成不必要的政策变化。

## 2026-07-18 22:03 — Rename the customer-facing product brand

**选择**：将所有面向用户的产品名统一改为 `RealTime Transcriber`，保留描述产品运行于 Obsidian 的必要说明，并在公开页脚加入独立社区插件、非官方关联声明。

**备选**：继续使用带 `Obsidian` 前缀的商业产品名，或删除所有对兼容平台的描述。

**否决理由**：带平台商标前缀的产品名会阻碍 Creem 商标声明；完全删除平台说明又会降低产品信息准确性。独立品牌加客观兼容性描述能同时减少混淆并保持透明。
