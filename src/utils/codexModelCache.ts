export interface AiBackendModelOption {
  value: string;
  label: string;
}

interface ParsedModelOption extends AiBackendModelOption {
  priority: number;
}

export function parseCodexModelCache(value: unknown): AiBackendModelOption[] {
  if (!isRecord(value) || !Array.isArray(value.models)) return [];

  const seen = new Set<string>();
  const models: ParsedModelOption[] = [];
  for (const item of value.models) {
    if (!isRecord(item) || item.visibility === "hide") continue;
    const slug = typeof item.slug === "string" ? item.slug.trim() : "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const displayName = typeof item.display_name === "string" ? item.display_name.trim() : slug;
    models.push({
      value: slug,
      label: formatModelLabel(displayName),
      priority: typeof item.priority === "number" && Number.isFinite(item.priority)
        ? item.priority
        : Number.MAX_SAFE_INTEGER,
    });
  }

  return models
    .sort((a, b) => a.priority - b.priority)
    .map(({ value: modelValue, label }) => ({ value: modelValue, label }));
}

function formatModelLabel(value: string): string {
  return value.replace(/^GPT-/i, "").replace(/-/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
