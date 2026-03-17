import { t } from "./i18n";

export const VIEW_TYPE_TRANSCRIPTION = "realtime-transcription-view";
export const DEFAULT_PORT = 18888;
export const PLUGIN_ID = "realtime-transcription";

export function getLangLabel(key: string): string {
  return t(`lang.${key}`) ?? key;
}

/** @deprecated Use getLangLabel() instead. Kept for backward compat as a getter. */
export const LANG_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    return t(`lang.${prop}`) ?? prop;
  },
});
