import { TranscriptEntry, SerializedTranscriptEntry } from "../types";

export function serializeEntry(entry: TranscriptEntry): SerializedTranscriptEntry {
  return {
    ...entry,
    wallTime: entry.wallTime instanceof Date
      ? entry.wallTime.toISOString()
      : String(entry.wallTime),
  };
}

export function deserializeEntry(raw: SerializedTranscriptEntry): TranscriptEntry {
  return {
    ...raw,
    wallTime: new Date(raw.wallTime),
  };
}
