import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import { BasePreviewAbility } from "../sdk";

const TAG_KEYWORDS = [
  "words",
  "word",
  "chars",
  "char",
  "len",
  "length",
  "count",
  "长度",
  "字数",
  "词数",
];

// Longest first so `length` is preferred over `len` and `chars` over `char`
// once the tag is stripped with an optional separator.
const KEYWORD_ALTERNATION = [...TAG_KEYWORDS]
  .sort((a, b) => b.length - a.length)
  .join("|");

// A keyword only tags the query when it sits at the start or at the end of it,
// separated by `:`/`：`/whitespace (or nothing, when it is the whole query).
// Substring matching used to hijack ordinary searches: `blender` contains
// `len`, `countdown` contains `count`, `wordpress` contains `word`.
const LEADING_TAG = new RegExp(
  `^(?:${KEYWORD_ALTERNATION})(?=$|[:：\\s])`,
  "i",
);
const TRAILING_TAG = new RegExp(
  `(?:^|[:：\\s])(?:${KEYWORD_ALTERNATION})$`,
  "i",
);
const LEADING_TAG_STRIP = new RegExp(
  `^(?:${KEYWORD_ALTERNATION})[:：\\s]*`,
  "i",
);
const TRAILING_TAG_STRIP = new RegExp(
  `[:：\\s]*(?:${KEYWORD_ALTERNATION})$`,
  "i",
);

function cleanQuotes(input: string): string {
  const trimmed = input.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function containsKeyword(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return LEADING_TAG.test(trimmed) || TRAILING_TAG.test(trimmed);
}

/** Drops the leading/trailing tag plus its separator from the counted text. */
function stripKeyword(input: string): string {
  return input
    .trim()
    .replace(LEADING_TAG_STRIP, "")
    .replace(TRAILING_TAG_STRIP, "")
    .trim();
}

export class TextStatsAbility extends BasePreviewAbility {
  readonly id = "preview.textstats";
  override readonly label = "Text Stats";
  readonly priority = 50;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 500,
      syntax:
        "text prefixed or suffixed with words/word/chars/char/len/length/count/长度/字数/词数",
      notes: "String counting only; no parser side effects.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
  };

  override canHandle(query: { text?: string }): boolean {
    if (!query.text || query.text.length > this.safety.input.maxLength)
      return false;
    return containsKeyword(query.text);
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const text = this.getNormalizedQuery(context.query);
    if (!containsKeyword(text) || !this.isInputWithinLimit(context))
      return null;

    let contentRaw = stripKeyword(text);
    const contentMatch = contentRaw.match(/["'`].+["'`]/);
    if (contentMatch) {
      contentRaw = contentMatch[0];
    }
    const content = cleanQuotes(contentRaw || text);

    const characters = content.length;
    const chineseChars = (content.match(/[\u4E00-\u9FA5]/g) ?? []).length;
    const words = content.trim().split(/\s+/).filter(Boolean).length;

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: content.slice(0, 24),
      subtitle: "文本统计",
      primaryLabel: "字符数",
      primaryValue: characters.toString(),
      secondaryLabel: "词数",
      secondaryValue: words.toString(),
      chips: [
        { label: "中文字符", value: chineseChars.toString() },
        { label: "ASCII", value: (characters - chineseChars).toString() },
      ],
      sections: [
        {
          rows: [
            { label: "去首尾空白", value: content.trim().length.toString() },
            { label: "行数", value: content.split(/\r?\n/).length.toString() },
          ],
        },
      ],
    };

    return {
      abilityId: this.id,
      confidence: 0.6,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }
}
