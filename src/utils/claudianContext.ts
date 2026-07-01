export const CLAUDIAN_CONTEXT_FOLDER = "Claudian/实时转写上下文";
export const CLAUDIAN_CONTEXT_FILE = `${CLAUDIAN_CONTEXT_FOLDER}/current.md`;

export function buildClaudianContextMarkdown(
  recordsMarkdown: string,
  entryCount: number,
  now = new Date(),
): string {
  return [
    "---",
    "source: realtime-transcription",
    "context: current-transcripts",
    `updated: ${now.toISOString()}`,
    `entries: ${entryCount}`,
    "---",
    "",
    "# 当前实时转写上下文",
    "",
    "下面是截至生成时的全部转写记录。用户会在 Claudian 中基于这些内容继续提问。",
    "",
    "## 转写记录",
    "",
    recordsMarkdown,
    "",
  ].join("\n");
}
