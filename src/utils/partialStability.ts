const COMPARISON_SKIP_RE = /[\s\p{P}\p{S}]/u;

function toComparableText(text: string): string {
  let normalized = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (COMPARISON_SKIP_RE.test(char)) continue;
    normalized += char.toLowerCase();
  }

  return normalized;
}

export function comparableLength(text: string): number {
  return toComparableText(text).length;
}

export function longestComparablePrefixLength(a: string, b: string): number {
  const comparableA = toComparableText(a);
  const comparableB = toComparableText(b);
  const n = Math.min(comparableA.length, comparableB.length);
  let index = 0;

  while (index < n && comparableA.charCodeAt(index) === comparableB.charCodeAt(index)) {
    index += 1;
  }

  return index;
}

export function comparableStartsWith(text: string, prefix: string): boolean {
  const comparableText = toComparableText(text);
  const comparablePrefix = toComparableText(prefix);

  return comparablePrefix.length > 0 && comparableText.startsWith(comparablePrefix);
}

export function shouldResetNoisyPartial(previousDisplay: string, current: string): boolean {
  const previousComparable = toComparableText(previousDisplay);
  const currentComparable = toComparableText(current);
  if (!previousComparable || !currentComparable) return false;

  const overlap = longestComparablePrefixLength(previousDisplay, current);
  if (overlap >= 2) return false;

  const previousHanCount = (previousDisplay.match(/[\u3400-\u9fff]/g) ?? []).length;
  const previousLatinCount = (previousDisplay.match(/[A-Za-z]/g) ?? []).length;
  const currentHanCount = (current.match(/[\u3400-\u9fff]/g) ?? []).length;

  const previousIsShort = previousComparable.length <= 4;
  const currentMuchLonger = currentComparable.length >= Math.max(previousComparable.length + 2, Math.ceil(previousComparable.length * 1.5));
  const scriptShiftToChinese = previousLatinCount > 0 && currentHanCount >= 4;
  const previousAppearsLater =
    previousComparable.length <= 4 &&
    currentComparable.includes(previousComparable) &&
    !currentComparable.startsWith(previousComparable);

  return currentMuchLonger && (previousIsShort || scriptShiftToChinese || previousAppearsLater);
}
