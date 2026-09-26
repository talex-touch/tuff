import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import { BasePreviewAbility } from "../sdk";

type LineOperation = "sort-asc" | "sort-desc" | "unique" | "drop-empty" | "trim";

interface LineOperationDefinition {
  operation: LineOperation;
  label: string;
  keywords: string[];
}

interface LineMatcher {
  definition: LineOperationDefinition;
  leading: RegExp;
  trailing: RegExp;
  stripLeading: RegExp;
  stripTrailing: RegExp;
}

/** Longest keyword first: `sort desc` must win over `sort`. */
const LINE_OPERATIONS: LineOperationDefinition[] = [
  {
    operation: "sort-desc",
    label: "降序排序",
    keywords: [
      "sort desc",
      "sort descending",
      "sort -r",
      "降序排列",
      "倒序排列",
      "降序",
      "倒序",
    ],
  },
  {
    operation: "sort-asc",
    label: "升序排序",
    keywords: [
      "sort asc",
      "sort ascending",
      "sort lines",
      "行排序",
      "升序排列",
      "升序",
      "sort",
      "排序",
    ],
  },
  {
    operation: "unique",
    label: "去重",
    keywords: ["unique lines", "dedupe", "dedup", "去除重复", "唯一行", "去重"],
  },
  {
    operation: "drop-empty",
    label: "删除空行",
    keywords: [
      "drop empty lines",
      "no empty lines",
      "drop empty",
      "删除空行",
      "删空行",
      "去空行",
    ],
  },
  {
    operation: "trim",
    label: "逐行去空格",
    keywords: ["trim lines", "trim each line", "去除行首尾空格", "逐行去空格", "trim"],
  },
];

const DETECT_SEPARATOR = "[\\s:：=-]";
const STRIP_SEPARATOR = "[\\s:：]*";
const MAX_LINES = 200;
const MAX_QUERY_LENGTH = 2000;

const LINE_MATCHERS: LineMatcher[] = LINE_OPERATIONS.map((definition) => {
  const alternation = definition.keywords.join("|");
  return {
    definition,
    leading: new RegExp(`^(?:${alternation})(?=$|${DETECT_SEPARATOR})`, "i"),
    trailing: new RegExp(`(?:^|${DETECT_SEPARATOR})(?:${alternation})$`, "i"),
    stripLeading: new RegExp(`^(?:${alternation})${STRIP_SEPARATOR}`, "i"),
    stripTrailing: new RegExp(`${STRIP_SEPARATOR}(?:${alternation})$`, "i"),
  };
});

interface ParsedLineQuery {
  operation: LineOperation;
  input: string;
  inputSource: "query" | "clipboard";
}

function resolveTextInput(
  inputs?: Array<{ content?: string; rawContent?: string }>,
): string {
  if (!inputs?.length) return "";
  const input = inputs.find(
    (item) => item.content?.trim() || item.rawContent?.trim(),
  );
  return (input?.content ?? input?.rawContent ?? "").trim();
}

function applyOperation(
  lines: string[],
  operation: LineOperation,
  locale: string,
): string[] {
  switch (operation) {
    case "sort-asc":
    case "sort-desc": {
      const collator = new Intl.Collator(locale, {
        numeric: true,
        sensitivity: "base",
      });
      const direction = operation === "sort-asc" ? 1 : -1;
      return [...lines].sort((a, b) => direction * collator.compare(a, b));
    }
    case "unique": {
      const seen = new Set<string>();
      return lines.filter((line) => {
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      });
    }
    case "drop-empty":
      return lines.filter((line) => line.trim().length > 0);
    case "trim":
      return lines.map((line) => line.trim());
    default:
      return lines;
  }
}

function parseLineQuery(query: {
  text?: string;
  inputs?: Array<{ content?: string; rawContent?: string }>;
}): ParsedLineQuery | null {
  const text = query.text?.trim() ?? "";
  if (!text || text.length > MAX_QUERY_LENGTH) return null;

  const clipboardText = resolveTextInput(query.inputs);

  for (const matcher of LINE_MATCHERS) {
    const fromLeading = matcher.leading.test(text)
      ? text.replace(matcher.stripLeading, "").trim()
      : null;
    const fromTrailing =
      fromLeading === null && matcher.trailing.test(text)
        ? text.replace(matcher.stripTrailing, "").trim()
        : null;
    const explicit = fromLeading ?? fromTrailing ?? null;
    if (explicit === null) continue;

    const input = explicit || clipboardText;
    if (!input) return null;

    return {
      operation: matcher.definition.operation,
      input,
      inputSource: explicit ? "query" : "clipboard",
    };
  }

  return null;
}

export class LineToolsAbility extends BasePreviewAbility {
  readonly id = "preview.lines";
  override readonly label = "Line Tools";
  readonly priority = 48;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: MAX_QUERY_LENGTH,
      syntax:
        "sort / sort desc / dedupe / drop empty / trim, with the text after or before the tag, or attached as a text input",
      notes: `Pure string line operations; at most ${MAX_LINES} lines are processed.`,
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
  };

  override canHandle(query: {
    text?: string;
    inputs?: Array<{ content?: string; rawContent?: string }>;
  }): boolean {
    return parseLineQuery(query) !== null;
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const parsed = parseLineQuery(context.query);
    if (!parsed) return null;

    this.throwIfAborted(context.signal);

    const definition = LINE_OPERATIONS.find(
      (candidate) => candidate.operation === parsed.operation,
    );
    const inputLines = parsed.input.replace(/\r\n?/g, "\n").split("\n");
    const truncated = inputLines.length > MAX_LINES;
    const targetLines = truncated ? inputLines.slice(0, MAX_LINES) : inputLines;
    const outputLines = applyOperation(
      targetLines,
      parsed.operation,
      context.locale ?? "zh-CN",
    );
    const output = outputLines.join("\n");

    const warnings: string[] = [];
    if (truncated) {
      warnings.push(`超过 ${MAX_LINES} 行，仅处理前 ${MAX_LINES} 行`);
    }
    if (!output) {
      warnings.push("处理后没有任何行");
    }

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: `${definition?.label ?? "行处理"}：${targetLines.length} → ${outputLines.length} 行`,
      subtitle: "行处理",
      primaryLabel: "结果",
      primaryValue: output,
      secondaryLabel: "行数变化",
      secondaryValue: `${targetLines.length} → ${outputLines.length}`,
      chips: [
        { label: "输入", value: `${targetLines.length} 行` },
        { label: "输出", value: `${outputLines.length} 行` },
        {
          label: "移除",
          value: `${targetLines.length - outputLines.length} 行`,
        },
      ],
      sections: [
        {
          title: "详情",
          rows: [
            { label: "操作", value: definition?.label ?? "行处理" },
            ...(parsed.operation === "unique"
              ? [{ label: "去重规则", value: "完全相同的行保留首次出现" }]
              : []),
            ...(parsed.operation === "sort-asc" || parsed.operation === "sort-desc"
              ? [
                  {
                    label: "排序规则",
                    value: `本地化排序（${context.locale ?? "zh-CN"}，数字按数值比较）`,
                  },
                ]
              : []),
            { label: "换行符", value: "统一为 LF" },
          ],
        },
      ],
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    return {
      abilityId: this.id,
      confidence: parsed.inputSource === "query" ? 0.7 : 0.62,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }
}
