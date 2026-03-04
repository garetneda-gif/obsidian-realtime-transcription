import type { App, PluginManifest } from "obsidian";

const path = require("path") as typeof import("path");

export function resolvePluginDir(app: App, manifest: PluginManifest): string {
  const adapter = app.vault.adapter as { getBasePath?: () => string };
  const vaultPath = adapter.getBasePath?.() ?? "";
  const configDir = app.vault.configDir;

  // Obsidian desktop 下最稳定的插件目录：<vault>/<configDir>/plugins/<plugin-id>
  if (vaultPath) {
    return path.join(vaultPath, ...configDir.split("/"), "plugins", manifest.id);
  }

  // 兜底：兼容极端环境（理论上 desktop 不会走到这里）
  return (manifest as PluginManifest & { dir?: string }).dir ?? "";
}
