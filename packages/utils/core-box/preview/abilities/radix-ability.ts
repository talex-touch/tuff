import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import { BasePreviewAbility } from "../sdk";

interface RadixDefinition {
  base: number;
  label: string;
  keywords: string[];
  prefix: string;
}

interface RadixMatcher {
  definition: RadixDefinition;
  leading: RegExp;
  trailing: RegExp;
  stripLeading: RegExp;
}

/** Longest keyword first so `hexadecimal` wins over `hex`. */
const RADIX_DEFINITIONS: RadixDefinition[] = [
  {
    base: 16,
    label: "十六进制",
    keywords: ["hexadecimal", "hex", "十六进制"],
    prefix: "0x",
  },
  { base: 2, label: "二进制", keywords: ["binary", "bin", "二进制"], prefix: "0b" },
  { base: 8, label: "八进制", keywords: ["octal", "oct", "八进制"], prefix: "0o" },
  { base: 10, label: "十进制", keywords: ["decimal", "dec", "十进制"], prefix: "" },
];

const ALL_KEYWORDS = RADIX_DEFINITIONS.flatMap(
  (definition) => definition.keywords,
).join("|");

/** Detection may look past `-`/`=`, stripping must not: `hex -255` keeps its sign. */
const DETECT_SEPARATOR = "[\\s:：=-]";
const STRIP_SEPARATOR = "[\\s:：]*";
const TRAILING_CONNECTOR =
  /(?:^|[\s:：=-])(?:to|in|as|转|换算成|换成|转为)[\s:：=-]*$/i;
const TRAILING_KEYWORD_STRIP = new RegExp(
  `${STRIP_SEPARATOR}(?:${ALL_KEYWORDS})$`,
  "i",
);

const RADIX_MATCHERS: RadixMatcher[] = RADIX_DEFINITIONS.map((definition) => {
  const alternation = definition.keywords.join("|");
  return {
    definition,
    leading: new RegExp(`^(?:${alternation})(?=$|${DETECT_SEPARATOR})`, "i"),
    trailing: new RegExp(`(?:^|${DETECT_SEPARATOR})(?:${alternation})$`, "i"),
    stripLeading: new RegExp(`^(?:${alternation})${STRIP_SEPARATOR}`, "i"),
  };
});

const RADIX_LABEL_BY_BASE: Record<number, string> = {
  2: "二进制",
  8: "八进制",
  10: "十进制",
  16: "十六进制",
};

const RADIX_PREFIX_BY_BASE: Record<number, string> = {
  2: "0b",
  8: "0o",
  10: "",
  16: "0x",
};

const DIGIT_PATTERN_BY_BASE: Record<number, RegExp> = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^[0-9]+$/,
  16: /^[0-9a-fA-F]+$/,
};

const PREFIXED_RADIXES: Array<{ pattern: RegExp; base: number }> = [
  { pattern: /^0[xX][0-9a-fA-F]+$/, base: 16 },
  { pattern: /^0[bB][01]+$/, base: 2 },
  { pattern: /^0[oO][0-7]+$/, base: 8 },
];

/** Beyond this the BigInt conversion itself becomes the bottleneck. */
const MAX_DIGIT_LENGTH = 128;
const MAX_QUERY_LENGTH = 120;

interface ParsedRadixQuery {
  value: bigint;
  sourceBase: number;
  targetBase: number;
}

function detectPrefixedBase(input: string): number | null {
  for (const { pattern, base } of PREFIXED_RADIXES) {
    if (pattern.test(input)) return base;
  }
  return null;
}

function parseDigits(raw: string, fallbackBase: number): bigint | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_DIGIT_LENGTH) return null;

  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[-+]/, "");
  const prefixedBase = detectPrefixedBase(unsigned);
  const base = prefixedBase ?? fallbackBase;
  const digits = prefixedBase === null ? unsigned : unsigned.slice(2);
  if (!DIGIT_PATTERN_BY_BASE[base].test(digits)) return null;

  const magnitude =
    base === 16
      ? BigInt(`0x${digits}`)
      : base === 8
        ? BigInt(`0o${digits}`)
        : base === 2
          ? BigInt(`0b${digits}`)
          : BigInt(digits);

  return negative ? -magnitude : magnitude;
}

function formatValue(value: bigint, targetBase: number): string {
  const negative = value < BigInt(0);
  const magnitude = negative ? -value : value;
  const prefix = magnitude === BigInt(0) ? "" : RADIX_PREFIX_BY_BASE[targetBase];
  return `${negative ? "-" : ""}${prefix}${magnitude.toString(targetBase)}`;
}

function formatGrouped(value: bigint): string {
  const negative = value < BigInt(0);
  const magnitude = (negative ? -value : value).toString(10);
  return `${negative ? "-" : ""}${magnitude.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Shared by the tagged and the prefixed-literal forms; `payload` is already tag-free. */
function resolveValue(
  payload: string,
  fallbackBase: number,
  targetBase: number,
): ParsedRadixQuery | null {
  const value = parseDigits(payload, fallbackBase);
  if (value === null) return null;

  return {
    value,
    sourceBase: detectPrefixedBase(payload.trim().replace(/^[-+]/, "")) ?? fallbackBase,
    targetBase,
  };
}

/**
 * Tagged form reads as "show this literal in the tagged base": the literal is
 * auto-detected (0x/0b/0o prefix, else decimal) and only falls back to the
 * tagged base when it is not a valid decimal — so `hex 255` → 0x1f while
 * `hex ff` → 255. A no-op pair (`dec 255`, `hex 0xff`) answers with the base the
 * user did not ask for instead of echoing the input.
 */
function resolveTaggedValue(
  payload: string,
  taggedBase: number,
): ParsedRadixQuery | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const unsigned = trimmed.replace(/^[-+]/, "");
  const prefixedBase = detectPrefixedBase(unsigned);
  const sourceBase =
    prefixedBase ?? (DIGIT_PATTERN_BY_BASE[10].test(unsigned) ? 10 : taggedBase);
  const value = parseDigits(trimmed, sourceBase);
  if (value === null) return null;

  const targetBase =
    sourceBase === taggedBase ? (taggedBase === 10 ? 16 : 10) : taggedBase;

  return { value, sourceBase, targetBase };
}

function parseRadixQuery(text: string): ParsedRadixQuery | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_QUERY_LENGTH) return null;

  for (const matcher of RADIX_MATCHERS) {
    const base = matcher.definition.base;

    if (matcher.leading.test(trimmed)) {
      return resolveTaggedValue(trimmed.replace(matcher.stripLeading, ""), base);
    }

    if (matcher.trailing.test(trimmed)) {
      const payload = trimmed
        .replace(TRAILING_KEYWORD_STRIP, "")
        .replace(TRAILING_CONNECTOR, "")
        .trim();
      return resolveTaggedValue(payload, base);
    }
  }

  const prefixedBase = detectPrefixedBase(trimmed.replace(/^[-+]/, ""));
  if (prefixedBase === null) return null;

  return resolveValue(trimmed, prefixedBase, 10);
}

export class RadixConversionAbility extends BasePreviewAbility {
  readonly id = "preview.radix";
  override readonly label = "Radix Conversion";
  readonly priority = 26;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: MAX_QUERY_LENGTH,
      syntax:
        "hex/bin/oct/dec tag, `255 to hex`, or a prefixed literal such as 0x1f",
      notes:
        "Integer-only BigInt conversion; two's complement bit views are out of scope.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
  };

  override canHandle(query: { text?: string }): boolean {
    if (!query.text || query.text.length > this.safety.input.maxLength)
      return false;
    return parseRadixQuery(query.text) !== null;
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const text = this.getNormalizedQuery(context.query);
    if (!text || !this.isInputWithinLimit(context)) return null;

    const parsed = parseRadixQuery(text);
    if (!parsed) return null;

    const magnitude = parsed.value < BigInt(0) ? -parsed.value : parsed.value;
    const bits = magnitude.toString(2).length;

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: text,
      subtitle: "进制转换",
      primaryLabel: `${RADIX_LABEL_BY_BASE[parsed.sourceBase]} → ${RADIX_LABEL_BY_BASE[parsed.targetBase]}`,
      primaryValue: formatValue(parsed.value, parsed.targetBase),
      secondaryLabel: "十进制",
      secondaryValue: formatGrouped(parsed.value),
      chips: RADIX_DEFINITIONS.map((definition) => ({
        label: definition.label,
        value: formatValue(parsed.value, definition.base),
      })),
      sections: [
        {
          title: "详情",
          rows: [
            { label: "位宽", value: `${bits} bit` },
            { label: "字节数", value: `${Math.ceil(bits / 8)} B` },
          ],
        },
      ],
      warnings:
        bits > 64 ? ["超出 64 位整数范围，按任意精度整数计算"] : undefined,
    };

    return {
      abilityId: this.id,
      confidence: 0.7,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }
}
