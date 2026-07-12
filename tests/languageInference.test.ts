import assert from "node:assert/strict";
import test from "node:test";
import { inferTranscriptLanguage } from "../src/utils/language.ts";

test("Chinese transcript with English acronyms, numbers, and percentages remains Chinese", () => {
  const text =
    "但是中国GDP在公业园里工业园景这个也就是距今这个这都正好2000年前是吧？我们在2000年前就在世界GDP总量了26%。";

  assert.equal(inferTranscriptLanguage("hybrid", text), "zh");
});

test("Chinese transcript with substantial English prose is detected as hybrid", () => {
  const text = "那么这个况是预样，因为然后他首先一定是发生呢，but in bodies dont really disappear still there。";

  assert.equal(inferTranscriptLanguage("zh", text), "hybrid");
});

test("English transcript remains English when there is no Chinese body text", () => {
  assert.equal(inferTranscriptLanguage("zh", "There are many examples in this chapter."), "en");
});
