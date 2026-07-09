type JsonRecord = Record<string, unknown>;

export function extractTextFromResponse(data: unknown): string {
  const record = asRecord(data);
  if (!record) return "";

  const outputText = trimmedString(record.output_text);
  if (outputText) return outputText;

  const responseOutput = textFromOutput(record.output);
  if (responseOutput) return responseOutput;

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choice = asRecord(choices[0]);
  if (!choice) return "";

  const message = asRecord(choice.message);
  const chatContent = textFromContent(message?.content);
  if (chatContent) return chatContent;

  const text = trimmedString(choice.text);
  if (text) return text;

  return "";
}

function textFromOutput(output: unknown): string {
  if (!Array.isArray(output)) return "";

  return output
    .map((item) => textFromPart(item))
    .join("")
    .trim();
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => textFromPart(part))
      .join("")
      .trim();
  }
  return textFromPart(content).trim();
}

function textFromPart(part: unknown): string {
  const record = asRecord(part);
  if (!record) return "";

  const text = rawString(record.text);
  if (text) return text;

  const value = rawString(record.value);
  if (value) return value;

  const textRecord = asRecord(record.text);
  const nestedValue = rawString(textRecord?.value);
  if (nestedValue) return nestedValue;

  const content = textFromContent(record.content);
  if (content) return content;

  return "";
}

function asRecord(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonRecord;
}

function trimmedString(value: unknown): string {
  return rawString(value).trim();
}

function rawString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
