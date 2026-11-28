import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import { BasePreviewAbility } from "../sdk";

type QuickOpsOperation =
  | "json-format"
  | "json-minify"
  | "json-validate"
  | "url-encode"
  | "url-decode"
  | "base64-encode"
  | "base64-decode"
  | "timestamp"
  | "date-convert"
  | "uuid-v4"
  | "short-id"
  | "qr-code"
  | "jwt-decode"
  | "regex-test"
  | "markdown-table-format"
  | "csv-to-markdown"
  | "markdown-to-csv"
  | "case-upper"
  | "case-lower"
  | "case-camel"
  | "case-snake"
  | "case-kebab";

interface ParsedRegexInput {
  pattern: string;
  flags: string;
  target: string;
  targetSource: "query" | "clipboard";
}

interface RegexMatchResult {
  matches: string[];
  truncated: boolean;
}

interface ParsedQuickOpsCommand {
  operation: QuickOpsOperation;
  input: string;
  inputSource: "query" | "clipboard";
  regex?: ParsedRegexInput;
}

const OPERATION_LABELS: Record<QuickOpsOperation, string> = {
  "json-format": "JSON 格式化",
  "json-minify": "JSON 压缩",
  "json-validate": "JSON 校验",
  "url-encode": "URL 编码",
  "url-decode": "URL 解码",
  "base64-encode": "Base64 编码",
  "base64-decode": "Base64 解码",
  timestamp: "时间戳转换",
  "date-convert": "日期 / 时区转换",
  "uuid-v4": "UUID v4 生成",
  "short-id": "短 ID 生成",
  "qr-code": "QR Code 生成",
  "jwt-decode": "JWT 解码",
  "regex-test": "Regex 测试",
  "markdown-table-format": "Markdown 表格整理",
  "csv-to-markdown": "CSV 转 Markdown",
  "markdown-to-csv": "Markdown 转 CSV",
  "case-upper": "转换为大写",
  "case-lower": "转换为小写",
  "case-camel": "转换为 camelCase",
  "case-snake": "转换为 snake_case",
  "case-kebab": "转换为 kebab-case",
};

const QUERY_PREFIX_SEPARATOR = /^(?::|：|->|-)?\s*/;
const COMMAND_END = "(?=\\s|:|：|-|$)";
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const SHORT_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
const DEFAULT_SHORT_ID_LENGTH = 10;
const MIN_SHORT_ID_LENGTH = 4;
const MAX_SHORT_ID_LENGTH = 32;
const MAX_REGEX_PATTERN_LENGTH = 256;
const MAX_REGEX_TARGET_LENGTH = 2000;
const MAX_REGEX_MATCHES = 20;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 20;
const MAX_QR_CODE_BYTE_LENGTH = 230;
const QR_ECC_LEVEL = "L";
const QR_VERSIONS = [
  {
    version: 1,
    size: 21,
    blockCount: 1,
    dataCodewordsPerBlock: 19,
    eccCodewordsPerBlock: 7,
    alignmentCenters: [],
  },
  {
    version: 2,
    size: 25,
    blockCount: 1,
    dataCodewordsPerBlock: 34,
    eccCodewordsPerBlock: 10,
    alignmentCenters: [6, 18],
  },
  {
    version: 3,
    size: 29,
    blockCount: 1,
    dataCodewordsPerBlock: 55,
    eccCodewordsPerBlock: 15,
    alignmentCenters: [6, 22],
  },
  {
    version: 4,
    size: 33,
    blockCount: 1,
    dataCodewordsPerBlock: 80,
    eccCodewordsPerBlock: 20,
    alignmentCenters: [6, 26],
  },
  {
    version: 5,
    size: 37,
    blockCount: 1,
    dataCodewordsPerBlock: 108,
    eccCodewordsPerBlock: 26,
    alignmentCenters: [6, 30],
  },
  {
    version: 6,
    size: 41,
    blockCount: 2,
    dataCodewordsPerBlock: 68,
    eccCodewordsPerBlock: 18,
    alignmentCenters: [6, 34],
  },
  {
    version: 7,
    size: 45,
    blockCount: 2,
    dataCodewordsPerBlock: 78,
    eccCodewordsPerBlock: 20,
    alignmentCenters: [6, 22, 38],
  },
  {
    version: 8,
    size: 49,
    blockCount: 2,
    dataCodewordsPerBlock: 97,
    eccCodewordsPerBlock: 24,
    alignmentCenters: [6, 24, 42],
  },
  {
    version: 9,
    size: 53,
    blockCount: 2,
    dataCodewordsPerBlock: 116,
    eccCodewordsPerBlock: 30,
    alignmentCenters: [6, 26, 46],
  },
] as const;
const UTC_OFFSET_PATTERN = /\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/i;

export class QuickOpsDeveloperAbility extends BasePreviewAbility {
  readonly id = "preview.quickops.developer";
  override readonly label = "QuickOps Developer";
  readonly priority = 42;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 5000,
      syntax:
        "QuickOps developer commands: json, url encode/decode, base64 encode/decode, jwt decode, regex test, markdown table, csv to markdown, markdown to csv, timestamp, date/timezone, uuid, short id, qr code, case upper/lower/camel/snake/kebab",
      notes: "Pure TypeScript transforms only; no network, no dynamic code execution.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
  };

  override canHandle(query: { text?: string; inputs?: Array<{ content?: string }> }): boolean {
    const parsed = parseQuickOpsCommand(query);
    return parsed !== null && parsed.input.length <= this.safety.input.maxLength;
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const parsed = parseQuickOpsCommand(context.query);
    if (!parsed || parsed.input.length > this.safety.input.maxLength) return null;

    this.throwIfAborted(context.signal);

    const payload = executeQuickOpsCommand(parsed);
    if (!payload) return null;

    return {
      abilityId: this.id,
      confidence: parsed.inputSource === "query" ? 0.78 : 0.72,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }
}

export function parseQuickOpsCommand(query: {
  text?: string;
  inputs?: Array<{ content?: string; rawContent?: string }>;
}): ParsedQuickOpsCommand | null {
  const text = query.text?.trim() ?? "";
  if (!text) return null;

  const clipboardText = resolveTextInput(query.inputs);
  const command = parseCommandText(text);
  if (!command) return null;

  if (command.operation === "regex-test") {
    const regex = parseRegexInput(command.input, clipboardText);
    if (!regex) return null;

    return {
      operation: command.operation,
      input: `${regex.pattern}/${regex.flags} ${regex.target}`,
      inputSource: regex.targetSource,
      regex,
    };
  }

  const explicitInput = command.input.trim();
  if (command.operation === "uuid-v4" && explicitInput) return null;

  if (command.operation === "date-convert") {
    const input = resolveDateConvertCommandInput(explicitInput, clipboardText);
    if (!input) return null;

    return {
      operation: command.operation,
      input,
      inputSource: explicitInput && !looksLikeUtcOffsetOnly(explicitInput) ? "query" : "clipboard",
    };
  }

  const input =
    command.operation === "uuid-v4" || command.operation === "short-id"
      ? explicitInput
      : explicitInput || clipboardText;
  if (command.operation !== "uuid-v4" && command.operation !== "short-id" && !input) return null;

  return {
    operation: command.operation,
    input,
    inputSource:
      explicitInput || command.operation === "uuid-v4" || command.operation === "short-id"
        ? "query"
        : "clipboard",
  };
}

function resolveDateConvertCommandInput(explicitInput: string, clipboardText: string): string {
  if (!explicitInput) return clipboardText;
  if (clipboardText && looksLikeUtcOffsetOnly(explicitInput)) {
    return `${clipboardText} ${explicitInput}`;
  }
  return explicitInput;
}

function looksLikeUtcOffsetOnly(input: string): boolean {
  const trimmed = input.trim();
  const match = UTC_OFFSET_PATTERN.exec(trimmed);
  return match !== null && match.index === 0 && match[0].length === trimmed.length;
}

export function hasQuickOpsDeveloperCommand(query: { text?: string }): boolean {
  const text = query.text?.trim() ?? "";
  if (!text) return false;

  const command = parseCommandText(text);
  if (!command) return false;

  return command.operation !== "uuid-v4" || !command.input.trim();
}

function resolveTextInput(inputs?: Array<{ content?: string; rawContent?: string }>): string {
  if (!inputs?.length) return "";
  const input = inputs.find((item) => item.content?.trim() || item.rawContent?.trim());
  return (input?.content ?? input?.rawContent ?? "").trim();
}

function parseCommandText(text: string): { operation: QuickOpsOperation; input: string } | null {
  const normalized = text.trim();

  const json = parseJsonCommand(normalized);
  if (json) return json;

  const url = parseUrlCommand(normalized);
  if (url) return url;

  const base64 = parseBase64Command(normalized);
  if (base64) return base64;

  const jwt = parseJwtCommand(normalized);
  if (jwt) return jwt;

  const regex = parseRegexCommand(normalized);
  if (regex) return regex;

  const table = parseTableCommand(normalized);
  if (table) return table;

  const date = parseDateCommand(normalized);
  if (date) return date;

  const uuid = parseUuidCommand(normalized);
  if (uuid) return uuid;

  const shortId = parseShortIdCommand(normalized);
  if (shortId) return shortId;

  const qrCode = parseQrCodeCommand(normalized);
  if (qrCode) return qrCode;

  const caseConvert = parseCaseCommand(normalized);
  if (caseConvert) return caseConvert;

  return parseTimestampCommand(normalized);
}

function stripCommandInput(value: string, consumedLength: number): string {
  return value.slice(consumedLength).replace(QUERY_PREFIX_SEPARATOR, "").trim();
}

function parseJsonCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(json|format json|json format|json pretty|json prettify|json minify|json compact|json validate|json check|格式化\\s*json|压缩\\s*json|校验\\s*json)${COMMAND_END}`,
    "i",
  ).exec(
    text,
  );
  if (!prefixMatch) return null;

  const command = prefixMatch[1]?.toLowerCase() ?? "";
  const operation =
    command.includes("minify") ||
    command.includes("compact") ||
    command.includes("压缩")
      ? "json-minify"
      : command.includes("validate") ||
          command.includes("check") ||
          command.includes("校验")
        ? "json-validate"
        : "json-format";

  return {
    operation,
    input: stripCommandInput(text, prefixMatch[0].length),
  };
}

function parseUrlCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(url(?:\\s+uri)?|uri|url\\s*编码|url\\s*解码|编码\\s*url|解码\\s*url)${COMMAND_END}`,
    "i",
  ).exec(
    text,
  );
  if (!prefixMatch) return null;

  const command = prefixMatch[1]?.toLowerCase() ?? "";
  const rest = stripCommandInput(text, prefixMatch[0].length);
  if (command.includes("编码")) return { operation: "url-encode", input: rest };
  if (command.includes("解码")) return { operation: "url-decode", input: rest };

  const modeMatch = /^(encode|decode|编码|解码)\b/i.exec(rest);
  if (!modeMatch) return null;

  return {
    operation:
      modeMatch[1]?.toLowerCase() === "decode" || modeMatch[1] === "解码"
        ? "url-decode"
        : "url-encode",
    input: stripCommandInput(rest, modeMatch[0].length),
  };
}

function parseBase64Command(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(base64|b64|base64\\s*编码|base64\\s*解码|编码\\s*base64|解码\\s*base64)${COMMAND_END}`,
    "i",
  ).exec(
    text,
  );
  if (!prefixMatch) return null;

  const command = prefixMatch[1]?.toLowerCase() ?? "";
  const rest = stripCommandInput(text, prefixMatch[0].length);
  if (command.includes("编码")) return { operation: "base64-encode", input: rest };
  if (command.includes("解码")) return { operation: "base64-decode", input: rest };

  const modeMatch = /^(encode|decode|编码|解码)\b/i.exec(rest);
  if (!modeMatch) return null;

  return {
    operation:
      modeMatch[1]?.toLowerCase() === "decode" || modeMatch[1] === "解码"
        ? "base64-decode"
        : "base64-encode",
    input: stripCommandInput(rest, modeMatch[0].length),
  };
}

function parseJwtCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(jwt|jwt\\s+decode|decode\\s+jwt|解析\\s*jwt|解码\\s*jwt)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  const command = prefixMatch[1]?.toLowerCase() ?? "";
  const rest = stripCommandInput(text, prefixMatch[0].length);
  if (command === "jwt") {
    const modeMatch = /^(decode|解析|解码)\b/i.exec(rest);
    return {
      operation: "jwt-decode",
      input: modeMatch ? stripCommandInput(rest, modeMatch[0].length) : rest,
    };
  }

  return {
    operation: "jwt-decode",
    input: rest,
  };
}

function parseRegexCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(regex|regexp|regular\\s+expression|regex\\s+test|test\\s+regex|正则|正则\\s*测试|测试\\s*正则)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  return {
    operation: "regex-test",
    input: stripCommandInput(text, prefixMatch[0].length),
  };
}

function parseTableCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(markdown\\s+table|md\\s+table|format\\s+markdown\\s+table|format\\s+md\\s+table|表格整理|整理\\s*markdown\\s*表格|markdown\\s*表格|md\\s*表格|csv\\s+to\\s+markdown|csv\\s+to\\s+md|csv\\s*转\\s*markdown|csv\\s*转\\s*md|markdown\\s+to\\s+csv|md\\s+to\\s+csv|markdown\\s*转\\s*csv|md\\s*转\\s*csv)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  const command = prefixMatch[1]?.toLowerCase() ?? "";
  const operation =
    command.includes("to csv") || command.includes("转csv") || command.includes("转 csv")
      ? "markdown-to-csv"
      : command.includes("csv") && (command.includes("markdown") || command.includes("md"))
        ? "csv-to-markdown"
        : "markdown-table-format";

  return {
    operation,
    input: stripCommandInput(text, prefixMatch[0].length),
  };
}

function parseDateCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(date|datetime|time\\s+zone|timezone|tz|date\\s+convert|convert\\s+date|日期|日期转换|时区|时区转换)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  return {
    operation: "date-convert",
    input: stripCommandInput(text, prefixMatch[0].length),
  };
}

function parseRegexInput(input: string, clipboardText: string): ParsedRegexInput | null {
  const rest = stripRegexMode(input.trim());
  if (!rest) return null;

  const literal = parseRegexLiteral(rest);
  if (!literal) return null;

  const explicitTarget = literal.rest.trim();
  const target = explicitTarget || clipboardText;
  if (!target) return null;

  return {
    pattern: literal.pattern,
    flags: literal.flags,
    target,
    targetSource: explicitTarget ? "query" : "clipboard",
  };
}

function stripRegexMode(input: string): string {
  const modeMatch = /^(test|match|测试|匹配)(?=\s|:|：|-|$)/i.exec(input);
  return modeMatch ? stripCommandInput(input, modeMatch[0].length) : input;
}

function parseRegexLiteral(input: string): { pattern: string; flags: string; rest: string } | null {
  if (!input.startsWith("/")) return null;

  const closingSlashIndex = findRegexClosingSlash(input);
  if (closingSlashIndex <= 0) return null;

  const pattern = input.slice(1, closingSlashIndex);
  const afterSlash = input.slice(closingSlashIndex + 1);
  const flagsMatch = /^([A-Za-z]*)([\s\S]*)$/.exec(afterSlash);
  if (!flagsMatch) return null;

  return {
    pattern,
    flags: flagsMatch[1] ?? "",
    rest: stripCommandInput(flagsMatch[2] ?? "", 0),
  };
}

function findRegexClosingSlash(input: string): number {
  let escaped = false;
  for (let index = 1; index < input.length; index += 1) {
    const char = input[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "/") return index;
  }
  return -1;
}

function parseUuidCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(uuid\\s*v4|uuidv4|generate\\s+uuid\\s*v4|generate\\s+uuid|生成\\s*uuid\\s*v4|生成\\s*uuid|uuid)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  return {
    operation: "uuid-v4",
    input: stripCommandInput(text, prefixMatch[0].length),
  };
}

function parseShortIdCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(short\\s*id|shortid|random\\s*id|生成\\s*短\\s*id|短\\s*id)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  return {
    operation: "short-id",
    input: stripCommandInput(text, prefixMatch[0].length),
  };
}

function parseQrCodeCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(qr\\s*code|qrcode|qr|generate\\s+qr\\s*code|生成\\s*二维码|二维码)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  return {
    operation: "qr-code",
    input: stripCommandInput(text, prefixMatch[0].length),
  };
}

function parseCaseCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const prefixMatch = new RegExp(
    `^(case|text\\s+case|convert\\s+case|大小写|命名转换|转换命名)${COMMAND_END}`,
    "i",
  ).exec(text);
  if (!prefixMatch) return null;

  const rest = stripCommandInput(text, prefixMatch[0].length);
  const modeMatch = /^(upper|uppercase|lower|lowercase|camelcase|camel|snake_case|snake|kebab-case|kebab|大写|小写|驼峰|蛇形|短横线)(?=\s|:|：|-|$)/i.exec(
    rest,
  );
  if (!modeMatch) return null;

  return {
    operation: caseModeToOperation(modeMatch[1] ?? ""),
    input: stripCommandInput(rest, modeMatch[0].length),
  };
}

function caseModeToOperation(mode: string): QuickOpsOperation {
  const normalized = mode.toLowerCase();
  if (normalized === "upper" || normalized === "uppercase" || mode === "大写") {
    return "case-upper";
  }
  if (normalized === "lower" || normalized === "lowercase" || mode === "小写") {
    return "case-lower";
  }
  if (normalized === "camel" || normalized === "camelcase" || mode === "驼峰") {
    return "case-camel";
  }
  if (normalized === "kebab" || normalized === "kebab-case" || mode === "短横线") {
    return "case-kebab";
  }
  return "case-snake";
}

function parseTimestampCommand(text: string): { operation: QuickOpsOperation; input: string } | null {
  const explicitPrefix = new RegExp(`^(timestamp|unix(?:\\s+time)?|时间戳)${COMMAND_END}`, "i").exec(
    text,
  );
  if (explicitPrefix) {
    return {
      operation: "timestamp",
      input: stripCommandInput(text, explicitPrefix[0].length),
    };
  }

  if (!/(转|转换|本地时间|local time|to local|unix|timestamp|时间戳)/i.test(text)) {
    return null;
  }

  const numberMatch = text.match(/\b\d{10,13}\b/);
  if (!numberMatch) return null;

  return {
    operation: "timestamp",
    input: numberMatch[0],
  };
}

function executeQuickOpsCommand(parsed: ParsedQuickOpsCommand): PreviewCardPayload | null {
  switch (parsed.operation) {
    case "json-format":
    case "json-minify":
    case "json-validate":
      return buildJsonPayload(parsed);
    case "url-encode":
      return buildSimplePayload(parsed, encodeURIComponent(parsed.input));
    case "url-decode":
      return buildDecodedUrlPayload(parsed);
    case "base64-encode":
      return buildSimplePayload(parsed, encodeUtf8Base64(parsed.input));
    case "base64-decode":
      return buildBase64DecodePayload(parsed);
    case "jwt-decode":
      return buildJwtDecodePayload(parsed);
    case "regex-test":
      return buildRegexPayload(parsed);
    case "markdown-table-format":
      return buildMarkdownTablePayload(parsed);
    case "csv-to-markdown":
      return buildCsvToMarkdownPayload(parsed);
    case "markdown-to-csv":
      return buildMarkdownToCsvPayload(parsed);
    case "timestamp":
      return buildTimestampPayload(parsed);
    case "date-convert":
      return buildDateConvertPayload(parsed);
    case "uuid-v4":
      return buildUuidPayload(parsed);
    case "short-id":
      return buildShortIdPayload(parsed);
    case "qr-code":
      return buildQrCodePayload(parsed);
    case "case-upper":
    case "case-lower":
    case "case-camel":
    case "case-snake":
    case "case-kebab":
      return buildCasePayload(parsed);
  }
}

function buildJsonPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  try {
    const value = JSON.parse(parsed.input);
    const output =
      parsed.operation === "json-minify"
        ? JSON.stringify(value)
        : parsed.operation === "json-validate"
          ? "Valid JSON"
          : JSON.stringify(value, null, 2);

    return buildSimplePayload(parsed, output, {
      secondaryLabel: "状态",
      secondaryValue: "解析成功",
    });
  } catch (error) {
    return buildErrorPayload(parsed, error instanceof Error ? error.message : String(error));
  }
}

function buildDecodedUrlPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  try {
    return buildSimplePayload(parsed, decodeURIComponent(parsed.input));
  } catch (error) {
    return buildErrorPayload(parsed, error instanceof Error ? error.message : String(error));
  }
}

function buildBase64DecodePayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const normalized = parsed.input.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1 || !BASE64_PATTERN.test(normalized)) {
    return buildErrorPayload(parsed, "Invalid Base64 input");
  }

  try {
    const decoded = decodeUtf8Base64(normalized);
    return buildSimplePayload(parsed, decoded);
  } catch (error) {
    return buildErrorPayload(parsed, error instanceof Error ? error.message : String(error));
  }
}

function buildJwtDecodePayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const parts = parsed.input.trim().split(".");
  if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
    return buildErrorPayload(parsed, "Invalid JWT structure");
  }

  try {
    const header = decodeBase64UrlJson(parts[0]);
    const payload = decodeBase64UrlJson(parts[1]);
    const headerText = JSON.stringify(header, null, 2);
    const payloadText = JSON.stringify(payload, null, 2);

    return buildSimplePayload(parsed, payloadText, {
      primaryLabel: "Payload",
      secondaryLabel: "签名",
      secondaryValue: parts[2] ? "未验证" : "无签名段",
      sections: [
        {
          title: "JWT",
          rows: [
            { label: "Header", value: headerText, copyable: true },
            { label: "Payload", value: payloadText, copyable: true },
            { label: "Signature verified", value: "false" },
          ],
        },
      ],
      meta: {
        quickOps: {
          category: "developer",
          operation: parsed.operation,
          inputSource: parsed.inputSource,
          inputLength: parsed.input.length,
          signatureVerified: false,
        },
      },
    });
  } catch (error) {
    return buildErrorPayload(parsed, error instanceof Error ? error.message : String(error));
  }
}

function decodeBase64UrlJson(value: string): unknown {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = decodeUtf8Base64(padded);
  return JSON.parse(decoded);
}

function buildRegexPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const regexInput = parsed.regex;
  if (!regexInput) return buildErrorPayload(parsed, "Invalid Regex command");

  if (!regexInput.pattern || regexInput.pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return buildErrorPayload(
      parsed,
      `Regex pattern length must be between 1 and ${MAX_REGEX_PATTERN_LENGTH}`,
    );
  }
  if (hasRegexBacktrackingRisk(regexInput.pattern, regexInput.flags)) {
    return buildErrorPayload(
      parsed,
      "Regex pattern is too complex for preview",
    );
  }
  if (regexInput.target.length > MAX_REGEX_TARGET_LENGTH) {
    return buildErrorPayload(
      parsed,
      `Regex target text must be ${MAX_REGEX_TARGET_LENGTH} characters or fewer`,
    );
  }

  try {
    const regex = new RegExp(regexInput.pattern, regexInput.flags);
    const matchResult = collectRegexMatches(regex, regexInput.target);
    const matches = matchResult.matches;
    const matched = matches.length > 0;

    return buildSimplePayload(parsed, matched ? "匹配" : "未匹配", {
      primaryLabel: "匹配结果",
      secondaryLabel: "匹配数",
      secondaryValue: matches.length.toString(),
      sections: [
        {
          title: "Regex",
          rows: [
            { label: "Pattern", value: `/${regexInput.pattern}/${regexInput.flags}`, copyable: true },
            { label: "Target length", value: regexInput.target.length.toString() },
            { label: "Global", value: regex.global ? "true" : "false" },
            ...matches.map((match, index) => ({
              label: `Match ${index + 1}`,
              value: match,
              copyable: true,
            })),
          ],
        },
      ],
      warnings: matchResult.truncated
        ? [`Only the first ${MAX_REGEX_MATCHES} matches are shown`]
        : undefined,
      meta: {
        quickOps: {
          category: "developer",
          operation: parsed.operation,
          inputSource: parsed.inputSource,
          inputLength: parsed.input.length,
          patternLength: regexInput.pattern.length,
          targetLength: regexInput.target.length,
          matchCount: matches.length,
          truncatedMatches: matchResult.truncated,
        },
      },
    });
  } catch (error) {
    return buildErrorPayload(parsed, error instanceof Error ? error.message : String(error));
  }
}

interface RegexCharSet {
  ascii: Uint32Array;
  nonAscii: boolean;
}

type RegexAstNode =
  | { kind: "empty" }
  | { kind: "anchor" }
  | { kind: "backref" }
  | { kind: "charset"; set: RegexCharSet }
  | { kind: "sequence"; items: RegexAstNode[] }
  | { kind: "alternation"; branches: RegexAstNode[] }
  | { kind: "group"; body: RegexAstNode; lookaround: boolean }
  | { kind: "quantifier"; body: RegexAstNode; min: number; max: number };

const MAX_REGEX_QUANTIFIERS = 20;
const MAX_REGEX_GROUP_DEPTH = 12;
const MAX_REGEX_FINITE_REPETITION = 100;
const WIDE_QUANTIFIER_SPAN = 10;

function createEmptyCharSet(): RegexCharSet {
  return { ascii: new Uint32Array(4), nonAscii: false };
}

function createFullCharSet(): RegexCharSet {
  const ascii = new Uint32Array(4);
  ascii[0] = 0xFFFFFFFF;
  ascii[1] = 0xFFFFFFFF;
  ascii[2] = 0xFFFFFFFF;
  ascii[3] = 0xFFFFFFFF;
  return { ascii, nonAscii: true };
}

function addCodeToCharSet(target: RegexCharSet, code: number, ignoreCase: boolean): void {
  if (code < 0) return;
  if (code < 128) {
    target.ascii[code >>> 5] |= 1 << (code & 31);
    if (ignoreCase) {
      if (code >= 65 && code <= 90) {
        const lower = code + 32;
        target.ascii[lower >>> 5] |= 1 << (lower & 31);
      } else if (code >= 97 && code <= 122) {
        const upper = code - 32;
        target.ascii[upper >>> 5] |= 1 << (upper & 31);
      }
    }
  } else {
    target.nonAscii = true;
  }
}

function addRangeToCharSet(
  target: RegexCharSet,
  from: number,
  to: number,
  ignoreCase: boolean,
): void {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const asciiEnd = Math.min(end, 127);
  for (let code = Math.max(0, start); code <= asciiEnd; code += 1) {
    addCodeToCharSet(target, code, ignoreCase);
  }
  if (end >= 128) target.nonAscii = true;
}

function mergeCharSets(target: RegexCharSet, source: RegexCharSet): void {
  for (let i = 0; i < 4; i += 1) target.ascii[i] |= source.ascii[i]!;
  if (source.nonAscii) target.nonAscii = true;
}

function negateCharSet(source: RegexCharSet): RegexCharSet {
  const ascii = new Uint32Array(4);
  for (let i = 0; i < 4; i += 1) ascii[i] = (~source.ascii[i]!) >>> 0;
  return { ascii, nonAscii: !source.nonAscii };
}

function charSetsOverlap(a: RegexCharSet, b: RegexCharSet): boolean {
  if (a.nonAscii && b.nonAscii) return true;
  for (let i = 0; i < 4; i += 1) {
    if ((a.ascii[i]! & b.ascii[i]!) !== 0) return true;
  }
  return false;
}

function charSetForShorthand(ch: string, ignoreCase: boolean): RegexCharSet | null {
  if (ch === "d" || ch === "D") {
    const digits = createEmptyCharSet();
    addRangeToCharSet(digits, 48, 57, false);
    return ch === "d" ? digits : negateCharSet(digits);
  }
  if (ch === "w" || ch === "W") {
    const word = createEmptyCharSet();
    addRangeToCharSet(word, 48, 57, false);
    addRangeToCharSet(word, 65, 90, false);
    addRangeToCharSet(word, 97, 122, false);
    addCodeToCharSet(word, 95, false);
    return ch === "w" ? word : negateCharSet(word);
  }
  if (ch === "s" || ch === "S") {
    const ws = createEmptyCharSet();
    for (const code of [9, 10, 11, 12, 13, 32]) addCodeToCharSet(ws, code, false);
    ws.nonAscii = true;
    return ch === "s" ? ws : negateCharSet(ws);
  }
  if (ch === "p" || ch === "P") {
    return createFullCharSet();
  }
  if (ch === "n") {
    const set = createEmptyCharSet();
    addCodeToCharSet(set, 10, false);
    return set;
  }
  if (ch === "r") {
    const set = createEmptyCharSet();
    addCodeToCharSet(set, 13, false);
    return set;
  }
  if (ch === "t") {
    const set = createEmptyCharSet();
    addCodeToCharSet(set, 9, false);
    return set;
  }
  if (ch === "f") {
    const set = createEmptyCharSet();
    addCodeToCharSet(set, 12, false);
    return set;
  }
  if (ch === "v") {
    const set = createEmptyCharSet();
    addCodeToCharSet(set, 11, false);
    return set;
  }
  if (ch === "0") {
    const set = createEmptyCharSet();
    addCodeToCharSet(set, 0, false);
    return set;
  }
  const set = createEmptyCharSet();
  addCodeToCharSet(set, ch.charCodeAt(0), ignoreCase);
  return set;
}

function parseRegexAst(
  pattern: string,
  flags: string,
): { ast: RegexAstNode; quantifierCount: number; maxDepth: number } | null {
  const ignoreCase = flags.includes("i");
  const dotAll = flags.includes("s");
  let pos = 0;
  let quantifierCount = 0;
  let maxDepth = 0;

  function parseEscapeInClass(): { code?: number; set?: RegexCharSet } {
    if (pos >= pattern.length) return { set: createFullCharSet() };
    const ch = pattern[pos]!;
    pos += 1;
    if (ch === "x" && pos + 2 <= pattern.length && /^[0-9a-fA-F]{2}$/.test(pattern.slice(pos, pos + 2))) {
      const code = Number.parseInt(pattern.slice(pos, pos + 2), 16);
      pos += 2;
      return { code };
    }
    if (ch === "u") {
      if (pattern[pos] === "{") {
        const close = pattern.indexOf("}", pos + 1);
        if (close > pos + 1) {
          const code = Number.parseInt(pattern.slice(pos + 1, close), 16);
          pos = close + 1;
          return Number.isFinite(code) ? { code } : { set: createFullCharSet() };
        }
      } else if (pos + 4 <= pattern.length && /^[0-9a-fA-F]{4}$/.test(pattern.slice(pos, pos + 4))) {
        const code = Number.parseInt(pattern.slice(pos, pos + 4), 16);
        pos += 4;
        return { code };
      }
    }
    if ((ch === "p" || ch === "P") && pattern[pos] === "{") {
      const close = pattern.indexOf("}", pos + 1);
      if (close > pos) pos = close + 1;
      return { set: createFullCharSet() };
    }
    if (ch === "d" || ch === "D" || ch === "w" || ch === "W" || ch === "s" || ch === "S") {
      return { set: charSetForShorthand(ch, ignoreCase)! };
    }
    if (ch === "n") return { code: 10 };
    if (ch === "r") return { code: 13 };
    if (ch === "t") return { code: 9 };
    if (ch === "f") return { code: 12 };
    if (ch === "v") return { code: 11 };
    if (ch === "b") return { code: 8 };
    if (ch === "0") return { code: 0 };
    return { code: ch.charCodeAt(0) };
  }

  function parseCharClass(): RegexAstNode | null {
    pos += 1; // skip '['
    let negated = false;
    if (pattern[pos] === "^") {
      negated = true;
      pos += 1;
    }
    const set = createEmptyCharSet();
    let closed = false;
    let first = true;

    while (pos < pattern.length) {
      const ch = pattern[pos]!;
      if (ch === "]" && !first) {
        pos += 1;
        closed = true;
        break;
      }
      first = false;

      let startCode: number | undefined;
      if (ch === "\\") {
        pos += 1;
        const esc = parseEscapeInClass();
        if (esc.set) {
          mergeCharSets(set, esc.set);
          continue;
        }
        startCode = esc.code;
      } else {
        startCode = ch.charCodeAt(0);
        pos += 1;
      }

      if (
        startCode !== undefined &&
        pattern[pos] === "-" &&
        pos + 1 < pattern.length &&
        pattern[pos + 1] !== "]"
      ) {
        pos += 1; // skip '-'
        let endCode: number | undefined;
        if (pattern[pos] === "\\") {
          pos += 1;
          const escEnd = parseEscapeInClass();
          if (escEnd.set) {
            addCodeToCharSet(set, startCode, ignoreCase);
            addCodeToCharSet(set, 45, false);
            mergeCharSets(set, escEnd.set);
            continue;
          }
          endCode = escEnd.code;
        } else {
          endCode = pattern[pos]!.charCodeAt(0);
          pos += 1;
        }
        if (endCode !== undefined) {
          addRangeToCharSet(set, startCode, endCode, ignoreCase);
        }
      } else if (startCode !== undefined) {
        addCodeToCharSet(set, startCode, ignoreCase);
      }
    }

    if (!closed) return null;
    return { kind: "charset", set: negated ? negateCharSet(set) : set };
  }

  function parseQuantifier(): { min: number; max: number } | null {
    const ch = pattern[pos];
    if (ch === "*") {
      pos += 1;
      if (pattern[pos] === "?") pos += 1;
      return { min: 0, max: Number.POSITIVE_INFINITY };
    }
    if (ch === "+") {
      pos += 1;
      if (pattern[pos] === "?") pos += 1;
      return { min: 1, max: Number.POSITIVE_INFINITY };
    }
    if (ch === "?") {
      pos += 1;
      if (pattern[pos] === "?") pos += 1;
      return { min: 0, max: 1 };
    }
    if (ch === "{") {
      const rest = pattern.slice(pos);
      const braceMatch = /^\{(\d+)(?:,(\d*))?\}/.exec(rest);
      if (braceMatch) {
        const min = Number.parseInt(braceMatch[1]!, 10);
        const max =
          braceMatch[2] === undefined
            ? min
            : braceMatch[2] === ""
              ? Number.POSITIVE_INFINITY
              : Number.parseInt(braceMatch[2], 10);
        pos += braceMatch[0].length;
        if (pattern[pos] === "?") pos += 1;
        return { min, max };
      }
    }
    return null;
  }

  function parseAtom(depth: number): RegexAstNode | null {
    const ch = pattern[pos]!;
    if (ch === "(") {
      pos += 1;
      const nextDepth = depth + 1;
      if (nextDepth > maxDepth) maxDepth = nextDepth;
      let lookaround = false;
      if (pattern[pos] === "?") {
        pos += 1;
        if (pattern[pos] === ":" || pattern[pos] === "=" || pattern[pos] === "!") {
          lookaround = pattern[pos] === "=" || pattern[pos] === "!";
          pos += 1;
        } else if (pattern[pos] === "<") {
          pos += 1;
          if (pattern[pos] === "=" || pattern[pos] === "!") {
            lookaround = true;
            pos += 1;
          } else {
            const closeName = pattern.indexOf(">", pos);
            if (closeName === -1) return null;
            pos = closeName + 1;
          }
        }
      }
      const body = parseAlternation(nextDepth);
      if (!body || pattern[pos] !== ")") return null;
      pos += 1;
      return { kind: "group", body, lookaround };
    }
    if (ch === "[") {
      return parseCharClass();
    }
    if (ch === ".") {
      pos += 1;
      const set = createFullCharSet();
      if (!dotAll) {
        set.ascii[10 >>> 5] &= ~(1 << (10 & 31));
        set.ascii[13 >>> 5] &= ~(1 << (13 & 31));
      }
      return { kind: "charset", set };
    }
    if (ch === "^" || ch === "$") {
      pos += 1;
      return { kind: "anchor" };
    }
    if (ch === "\\") {
      pos += 1;
      if (pos >= pattern.length) return null;
      const esc = pattern[pos]!;
      if (esc >= "1" && esc <= "9") {
        pos += 1;
        return { kind: "backref" };
      }
      if (esc === "k" && pattern[pos + 1] === "<") {
        const close = pattern.indexOf(">", pos + 2);
        if (close === -1) return null;
        pos = close + 1;
        return { kind: "backref" };
      }
      if (esc === "b" || esc === "B") {
        pos += 1;
        return { kind: "anchor" };
      }
      const parsed = parseEscapeInClass();
      if (parsed.set) return { kind: "charset", set: parsed.set };
      const set = createEmptyCharSet();
      if (parsed.code !== undefined) addCodeToCharSet(set, parsed.code, ignoreCase);
      return { kind: "charset", set };
    }
    pos += 1;
    const set = createEmptyCharSet();
    addCodeToCharSet(set, ch.charCodeAt(0), ignoreCase);
    return { kind: "charset", set };
  }

  function parseSequence(depth: number): RegexAstNode | null {
    const items: RegexAstNode[] = [];
    while (pos < pattern.length && pattern[pos] !== ")" && pattern[pos] !== "|") {
      const atom = parseAtom(depth);
      if (!atom) return null;
      let node: RegexAstNode = atom;
      const quant = parseQuantifier();
      if (quant) {
        quantifierCount += 1;
        node = { kind: "quantifier", body: node, min: quant.min, max: quant.max };
      }
      items.push(node);
    }
    if (items.length === 0) return { kind: "empty" };
    if (items.length === 1) return items[0]!;
    return { kind: "sequence", items };
  }

  function parseAlternation(depth: number): RegexAstNode | null {
    const first = parseSequence(depth);
    if (!first) return null;
    const branches: RegexAstNode[] = [first];
    while (pos < pattern.length && pattern[pos] === "|") {
      pos += 1;
      const next = parseSequence(depth);
      if (!next) return null;
      branches.push(next);
    }
    if (branches.length === 1) return branches[0]!;
    return { kind: "alternation", branches };
  }

  const ast = parseAlternation(0);
  if (!ast || pos !== pattern.length) return null;
  return { ast, quantifierCount, maxDepth };
}

function canMatchEmpty(node: RegexAstNode): boolean {
  switch (node.kind) {
    case "empty":
    case "anchor":
      return true;
    case "charset":
    case "backref":
      return false;
    case "group":
      return node.lookaround ? true : canMatchEmpty(node.body);
    case "quantifier":
      return node.min === 0 || canMatchEmpty(node.body);
    case "sequence":
      return node.items.every(canMatchEmpty);
    case "alternation":
      return node.branches.some(canMatchEmpty);
  }
}

function firstCharSet(node: RegexAstNode): RegexCharSet {
  switch (node.kind) {
    case "empty":
    case "anchor":
      return createEmptyCharSet();
    case "backref":
      return createFullCharSet();
    case "charset":
      return node.set;
    case "group":
      return node.lookaround ? createEmptyCharSet() : firstCharSet(node.body);
    case "quantifier":
      return firstCharSet(node.body);
    case "alternation": {
      const merged = createEmptyCharSet();
      for (const branch of node.branches) mergeCharSets(merged, firstCharSet(branch));
      return merged;
    }
    case "sequence": {
      const merged = createEmptyCharSet();
      for (const item of node.items) {
        mergeCharSets(merged, firstCharSet(item));
        if (!canMatchEmpty(item)) break;
      }
      return merged;
    }
  }
}

function allCharSet(node: RegexAstNode): RegexCharSet {
  switch (node.kind) {
    case "empty":
    case "anchor":
      return createEmptyCharSet();
    case "backref":
      return createFullCharSet();
    case "charset":
      return node.set;
    case "group":
      return node.lookaround ? createEmptyCharSet() : allCharSet(node.body);
    case "quantifier":
      return allCharSet(node.body);
    case "alternation": {
      const merged = createEmptyCharSet();
      for (const branch of node.branches) mergeCharSets(merged, allCharSet(branch));
      return merged;
    }
    case "sequence": {
      const merged = createEmptyCharSet();
      for (const item of node.items) mergeCharSets(merged, allCharSet(item));
      return merged;
    }
  }
}

function isWideQuantifier(node: RegexAstNode): boolean {
  return (
    node.kind === "quantifier" &&
    (!Number.isFinite(node.max) || node.max - node.min >= WIDE_QUANTIFIER_SPAN)
  );
}

function containsVariableQuantifier(node: RegexAstNode): boolean {
  switch (node.kind) {
    case "empty":
    case "anchor":
    case "charset":
    case "backref":
      return false;
    case "group":
      return containsVariableQuantifier(node.body);
    case "quantifier":
      return node.min !== node.max || containsVariableQuantifier(node.body);
    case "sequence":
      return node.items.some(containsVariableQuantifier);
    case "alternation":
      return node.branches.some(containsVariableQuantifier);
  }
}

function containsLookaround(node: RegexAstNode): boolean {
  switch (node.kind) {
    case "empty":
    case "anchor":
    case "charset":
    case "backref":
      return false;
    case "group":
      return node.lookaround || containsLookaround(node.body);
    case "quantifier":
      return containsLookaround(node.body);
    case "sequence":
      return node.items.some(containsLookaround);
    case "alternation":
      return node.branches.some(containsLookaround);
  }
}

function hasOverlappingAlternation(node: RegexAstNode): boolean {
  switch (node.kind) {
    case "empty":
    case "anchor":
    case "charset":
    case "backref":
      return false;
    case "group":
      return !node.lookaround && hasOverlappingAlternation(node.body);
    case "quantifier":
      return hasOverlappingAlternation(node.body);
    case "sequence":
      return node.items.some(hasOverlappingAlternation);
    case "alternation": {
      const sets = node.branches.map(firstCharSet);
      for (let i = 0; i < sets.length; i += 1) {
        if (canMatchEmpty(node.branches[i]!)) return true;
        for (let j = i + 1; j < sets.length; j += 1) {
          if (charSetsOverlap(sets[i]!, sets[j]!)) return true;
        }
      }
      return node.branches.some(hasOverlappingAlternation);
    }
  }
}

function inspectRegexAstRisk(node: RegexAstNode, insideRepeat: boolean): boolean {
  switch (node.kind) {
    case "empty":
    case "anchor":
    case "charset":
      return false;
    case "backref":
      return true;
    case "group":
      if (insideRepeat && node.lookaround) return true;
      return inspectRegexAstRisk(node.body, insideRepeat);
    case "quantifier": {
      if (
        node.min > MAX_REGEX_FINITE_REPETITION ||
        (Number.isFinite(node.max) && node.max > MAX_REGEX_FINITE_REPETITION)
      ) {
        return true;
      }
      const isRepeatable = node.max > 1;
      const isVariable = node.min !== node.max;
      if (insideRepeat && isVariable) return true;
      if (isRepeatable) {
        if (containsLookaround(node.body)) return true;
        if (isVariable && canMatchEmpty(node.body)) return true;
        if (containsVariableQuantifier(node.body)) return true;
        if (hasOverlappingAlternation(node.body)) return true;
      }
      return inspectRegexAstRisk(node.body, insideRepeat || isRepeatable);
    }
    case "alternation":
      return node.branches.some((branch) => inspectRegexAstRisk(branch, insideRepeat));
    case "sequence": {
      let overlappingWideCount = 0;
      for (let i = 0; i < node.items.length; i += 1) {
        const current = node.items[i]!;
        if (inspectRegexAstRisk(current, insideRepeat)) return true;
        if (!isWideQuantifier(current)) continue;

        const currentChars = allCharSet(current);
        let overlapsImmediateFollower = false;
        for (let j = i + 1; j < node.items.length; j += 1) {
          const next = node.items[j]!;
          const nextFirst = firstCharSet(next);
          if (charSetsOverlap(currentChars, nextFirst)) {
            overlapsImmediateFollower = true;
            if (isWideQuantifier(next)) return true;
          }
          if (!canMatchEmpty(next)) break;
        }
        if (overlapsImmediateFollower) {
          overlappingWideCount += 1;
          if (overlappingWideCount >= 3) return true;
        }
      }
      return false;
    }
  }
}

export function hasRegexBacktrackingRisk(pattern: string, flags = ""): boolean {
  if (/\\[1-9]|\\k<[^>]+>/.test(pattern)) return true;

  const parsed = parseRegexAst(pattern, flags);
  if (!parsed) {
    // Allow invalid syntax to fall through to `new RegExp` so the caller gets the SyntaxError.
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern, flags);
    } catch {
      return false;
    }
    // Valid JS regex that our conservative parser did not model: fail closed.
    return true;
  }

  if (parsed.quantifierCount > MAX_REGEX_QUANTIFIERS || parsed.maxDepth > MAX_REGEX_GROUP_DEPTH) {
    return true;
  }

  return inspectRegexAstRisk(parsed.ast, false);
}

function collectRegexMatches(regex: RegExp, target: string): RegexMatchResult {
  const matches: string[] = [];
  regex.lastIndex = 0;

  if (!regex.global) {
    const match = regex.exec(target);
    return { matches: match ? [match[0]] : [], truncated: false };
  }

  while (matches.length <= MAX_REGEX_MATCHES) {
    const match = regex.exec(target);
    if (!match) break;

    matches.push(match[0]);
    if (match[0] === "") regex.lastIndex += 1;
    if (regex.lastIndex > target.length) break;
  }

  return {
    matches: matches.slice(0, MAX_REGEX_MATCHES),
    truncated: matches.length > MAX_REGEX_MATCHES,
  };
}

function buildMarkdownTablePayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const table = parseMarkdownTable(parsed.input);
  if (!table) return buildErrorPayload(parsed, "Invalid Markdown table input");

  return buildTablePayload(parsed, formatMarkdownTable(table.rows), table.rows);
}

function buildCsvToMarkdownPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const rows = parseCsvRows(parsed.input);
  if (!rows) return buildErrorPayload(parsed, "Invalid CSV input");

  return buildTablePayload(parsed, formatMarkdownTable(rows), rows);
}

function buildMarkdownToCsvPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const table = parseMarkdownTable(parsed.input);
  if (!table) return buildErrorPayload(parsed, "Invalid Markdown table input");

  return buildTablePayload(parsed, formatCsvRows(table.rows), table.rows);
}

function buildTablePayload(
  parsed: ParsedQuickOpsCommand,
  output: string,
  rows: string[][],
): PreviewCardPayload {
  return buildSimplePayload(parsed, output, {
    secondaryLabel: "尺寸",
    secondaryValue: `${rows.length}x${rows[0]?.length ?? 0}`,
    sections: [
      {
        rows: [
          {
            label: "输入来源",
            value: parsed.inputSource === "clipboard" ? "剪贴板" : "CoreBox 输入",
          },
          {
            label: "行数",
            value: rows.length.toString(),
          },
          {
            label: "列数",
            value: (rows[0]?.length ?? 0).toString(),
          },
        ],
      },
    ],
  });
}

function parseMarkdownTable(input: string): { rows: string[][] } | null {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tableLines = lines.filter((line) => line.includes("|"));
  if (tableLines.length < 2) return null;

  const rows = tableLines
    .filter((line) => !isMarkdownSeparatorRow(line))
    .map(splitMarkdownTableRow)
    .filter((row) => row.length > 0);

  return normalizeTableRows(rows);
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isMarkdownSeparatorRow(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseCsvRows(input: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (quoted) return null;
  row.push(cell.trim());
  rows.push(row);

  return normalizeTableRows(rows.filter((item) => item.some((cellValue) => cellValue.length > 0)))?.rows ?? null;
}

function normalizeTableRows(rows: string[][]): { rows: string[][] } | null {
  if (rows.length === 0 || rows.length > MAX_TABLE_ROWS) return null;

  const columnCount = Math.max(...rows.map((row) => row.length));
  if (columnCount === 0 || columnCount > MAX_TABLE_COLUMNS) return null;

  return {
    rows: rows.map((row) => {
      const normalized = [...row];
      while (normalized.length < columnCount) normalized.push("");
      return normalized;
    }),
  };
}

function formatMarkdownTable(rows: string[][]): string {
  const header = rows[0];
  if (!header) return "";

  const widths = header.map((_, columnIndex) =>
    Math.max(...rows.map((row) => row[columnIndex]?.length ?? 0), 3),
  );
  const formatRow = (row: string[]) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? 0, " ")).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;

  return [formatRow(header), separator, ...rows.slice(1).map(formatRow)].join("\n");
}

function formatCsvRows(rows: string[][]): string {
  return rows.map((row) => row.map(formatCsvCell).join(",")).join("\n");
}

function formatCsvCell(cell: string): string {
  if (!/[",\r\n]/.test(cell)) return cell;
  return `"${cell.replace(/"/g, "\"\"")}"`;
}

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function buildTimestampPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const raw = parsed.input.trim();
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return buildErrorPayload(parsed, "Invalid timestamp input");
  }

  const milliseconds = Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) {
    return buildErrorPayload(parsed, "Timestamp is out of supported range");
  }

  const local = date.toLocaleString();
  const iso = date.toISOString();
  const unixSeconds = Math.floor(date.getTime() / 1000).toString();
  const unixMilliseconds = date.getTime().toString();

  return buildSimplePayload(parsed, local, {
    primaryLabel: "本地时间",
    secondaryLabel: "ISO",
    secondaryValue: iso,
    sections: [
      {
        rows: [
          { label: "Unix 秒", value: unixSeconds, copyable: true },
          { label: "Unix 毫秒", value: unixMilliseconds, copyable: true },
          { label: "UTC", value: date.toUTCString(), copyable: true },
        ],
      },
    ],
  });
}

function buildDateConvertPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const dateInput = parseDateConvertInput(parsed.input);
  if (!dateInput) {
    return buildErrorPayload(parsed, "Invalid date/timezone input");
  }

  const date = new Date(dateInput.dateText);
  if (!Number.isFinite(date.getTime())) {
    return buildErrorPayload(parsed, "Invalid date input");
  }

  const rows = [
    { label: "UTC", value: date.toISOString(), copyable: true },
    { label: "Local", value: date.toLocaleString(), copyable: true },
    { label: "Unix 秒", value: Math.floor(date.getTime() / 1000).toString(), copyable: true },
    { label: "Unix 毫秒", value: date.getTime().toString(), copyable: true },
  ];
  const target = dateInput.offset
    ? formatDateAtUtcOffset(date, dateInput.offset.minutes)
    : date.toLocaleString();

  if (dateInput.offset) {
    rows.splice(1, 0, {
      label: dateInput.offset.label,
      value: target,
      copyable: true,
    });
  }

  return buildSimplePayload(parsed, target, {
    primaryLabel: dateInput.offset ? dateInput.offset.label : "本地时间",
    secondaryLabel: "UTC",
    secondaryValue: date.toISOString(),
    sections: [
      {
        rows,
      },
    ],
    warnings: dateInput.offset
      ? ["固定 UTC offset 转换，不包含地区名或夏令时规则"]
      : undefined,
    meta: {
      quickOps: {
        category: "developer",
        operation: parsed.operation,
        inputSource: parsed.inputSource,
        inputLength: parsed.input.length,
        targetOffsetMinutes: dateInput.offset?.minutes,
      },
    },
  });
}

function parseDateConvertInput(input: string): {
  dateText: string;
  offset?: { label: string; minutes: number };
} | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const offsetMatch = UTC_OFFSET_PATTERN.exec(normalized);
  if (!offsetMatch) return { dateText: stripDateInputDecorators(normalized) };

  const sign = offsetMatch[1] === "-" ? -1 : 1;
  const hours = Number(offsetMatch[2]);
  const minutes = Number(offsetMatch[3] ?? "0");
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours > 14 ||
    minutes > 59 ||
    (hours === 14 && minutes !== 0)
  ) {
    return null;
  }

  const offsetText = offsetMatch[0];
  const dateText = stripDateInputDecorators(
    `${normalized.slice(0, offsetMatch.index)} ${normalized.slice(offsetMatch.index + offsetText.length)}`,
  );
  if (!dateText) return null;

  const absoluteMinutes = hours * 60 + minutes;
  const offsetMinutes = sign * absoluteMinutes;
  return {
    dateText,
    offset: {
      label: formatUtcOffsetLabel(offsetMinutes),
      minutes: offsetMinutes,
    },
  };
}

function stripDateInputDecorators(value: string): string {
  return value
    .replace(/\b(to|in|at)\b/gi, " ")
    .replace(/\b(?:UTC|GMT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUtcOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60).toString().padStart(2, "0");
  const minutes = (absolute % 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

function formatDateAtUtcOffset(date: Date, offsetMinutes: number): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear().toString().padStart(4, "0");
  const month = (shifted.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = shifted.getUTCDate().toString().padStart(2, "0");
  const hours = shifted.getUTCHours().toString().padStart(2, "0");
  const minutes = shifted.getUTCMinutes().toString().padStart(2, "0");
  const seconds = shifted.getUTCSeconds().toString().padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${formatUtcOffsetLabel(offsetMinutes)}`;
}

function buildUuidPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) {
    return buildErrorPayload(parsed, "crypto.randomUUID is unavailable");
  }

  return buildSimplePayload(parsed, uuid, {
    primaryLabel: "UUID v4",
    secondaryLabel: "状态",
    secondaryValue: "已生成",
  });
}

function buildShortIdPayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const length = parseShortIdLength(parsed.input);
  if (length === null) {
    return buildErrorPayload(
      parsed,
      `Short ID length must be between ${MIN_SHORT_ID_LENGTH} and ${MAX_SHORT_ID_LENGTH}`,
    );
  }

  const id = generateShortId(length);
  if (!id) {
    return buildErrorPayload(parsed, "crypto.getRandomValues is unavailable");
  }

  return buildSimplePayload(parsed, id, {
    primaryLabel: "Short ID",
    secondaryLabel: "长度",
    secondaryValue: length.toString(),
  });
}

function buildQrCodePayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const input = parsed.input.trim();
  if (!input) return buildErrorPayload(parsed, "QR Code input is required");

  const encoded = new TextEncoder().encode(input);
  if (encoded.length > MAX_QR_CODE_BYTE_LENGTH) {
    return buildErrorPayload(
      parsed,
      `QR Code input must be ${MAX_QR_CODE_BYTE_LENGTH} bytes or fewer`,
    );
  }

  const qr = createQrCodeSvg(encoded);
  if (!qr) return buildErrorPayload(parsed, "QR Code input is too large for local preview");

  return buildSimplePayload(parsed, qr.dataUrl, {
    primaryLabel: "SVG Data URL",
    secondaryLabel: "版本",
    secondaryValue: `v${qr.version}-${QR_ECC_LEVEL}`,
    description: "本地生成 SVG QR Code，不上传内容。",
    sections: [
      {
        rows: [
          { label: "输入来源", value: parsed.inputSource === "clipboard" ? "剪贴板" : "CoreBox 输入" },
          { label: "字节数", value: encoded.length.toString() },
          { label: "尺寸", value: `${qr.size}x${qr.size}` },
          { label: "SVG", value: qr.svg, copyable: true },
        ],
      },
    ],
    meta: {
      quickOps: {
        category: "developer",
        operation: parsed.operation,
        inputSource: parsed.inputSource,
        inputLength: parsed.input.length,
        byteLength: encoded.length,
        qrVersion: qr.version,
        qrEccLevel: QR_ECC_LEVEL,
        qrSize: qr.size,
        render: {
          kind: "qr-code-svg",
          dataUrl: qr.dataUrl,
        },
      },
    },
  });
}

function createQrCodeSvg(data: Uint8Array): {
  version: number;
  size: number;
  svg: string;
  dataUrl: string;
} | null {
  const version = QR_VERSIONS.find((item) => getQrBitLength(data.length) <= getQrDataCodewordCount(item) * 8);
  if (!version) return null;

  const modules = createEmptyQrModules(version.size);
  drawQrFunctionPatterns(modules, version);
  const dataCodewords = buildQrDataCodewords(data, getQrDataCodewordCount(version));
  const codewords = buildQrFinalCodewords(dataCodewords, version);
  drawQrDataCodewords(modules, codewords);

  const darkModules = modules.map((row) => row.map((module) => !!module.dark));
  const svg = renderQrSvg(darkModules, 4);
  return {
    version: version.version,
    size: version.size,
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

function getQrBitLength(byteLength: number): number {
  return 4 + 8 + byteLength * 8;
}

function getQrDataCodewordCount(version: (typeof QR_VERSIONS)[number]): number {
  return version.blockCount * version.dataCodewordsPerBlock;
}

function createEmptyQrModules(size: number): Array<Array<{ dark: boolean; reserved: boolean }>> {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ dark: false, reserved: false })),
  );
}

function drawQrFunctionPatterns(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  version: (typeof QR_VERSIONS)[number],
): void {
  const size = modules.length;
  drawFinderPattern(modules, 0, 0);
  drawFinderPattern(modules, size - 7, 0);
  drawFinderPattern(modules, 0, size - 7);
  drawAlignmentPatterns(modules, version.alignmentCenters);

  for (let index = 8; index < size - 8; index += 1) {
    setQrModule(modules, 6, index, index % 2 === 0, true);
    setQrModule(modules, index, 6, index % 2 === 0, true);
  }

  setQrModule(modules, 8, size - 8, true, true);
  reserveQrFormatAreas(modules);
  reserveQrVersionAreas(modules, version.version);
}

function drawFinderPattern(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  left: number,
  top: number,
): void {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const row = top + y;
      const column = left + x;
      if (!isQrCoordinateInBounds(modules, column, row)) continue;

      const inPattern = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const dark =
        inPattern &&
        (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
      setQrModule(modules, column, row, dark, true);
    }
  }
}

function drawAlignmentPatterns(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  centers: readonly number[],
): void {
  for (const centerColumn of centers) {
    for (const centerRow of centers) {
      if (isQrAlignmentOverFinder(modules.length, centerColumn, centerRow)) continue;
      drawAlignmentPattern(modules, centerColumn, centerRow);
    }
  }
}

function isQrAlignmentOverFinder(size: number, centerColumn: number, centerRow: number): boolean {
  return (
    (centerColumn === 6 && centerRow === 6) ||
    (centerColumn === 6 && centerRow === size - 7) ||
    (centerColumn === size - 7 && centerRow === 6)
  );
}

function drawAlignmentPattern(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  centerColumn: number,
  centerRow: number,
): void {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      setQrModule(modules, centerColumn + x, centerRow + y, distance !== 1, true);
    }
  }
}

function reserveQrFormatAreas(modules: Array<Array<{ dark: boolean; reserved: boolean }>>): void {
  const size = modules.length;
  for (let index = 0; index < 9; index += 1) {
    if (index !== 6) {
      reserveQrModule(modules, 8, index);
      reserveQrModule(modules, index, 8);
    }
  }
  for (let index = 0; index < 8; index += 1) {
    reserveQrModule(modules, size - 1 - index, 8);
    reserveQrModule(modules, 8, size - 1 - index);
  }
}

function reserveQrVersionAreas(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  version: number,
): void {
  if (version < 7) return;

  const size = modules.length;
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      reserveQrModule(modules, size - 11 + x, y);
      reserveQrModule(modules, y, size - 11 + x);
    }
  }
}

function buildQrDataCodewords(data: Uint8Array, dataCodewords: number): number[] {
  const bits: number[] = [0, 1, 0, 0];
  appendQrBits(bits, data.length, 8);
  for (const byte of data) appendQrBits(bits, byte, 8);

  const capacityBits = dataCodewords * 8;
  appendQrBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }

  let pad = 0xec;
  while (codewords.length < dataCodewords) {
    codewords.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return codewords;
}

function buildQrFinalCodewords(
  dataCodewords: number[],
  version: (typeof QR_VERSIONS)[number],
): number[] {
  const dataBlocks = Array.from({ length: version.blockCount }, (_, index) => {
    const start = index * version.dataCodewordsPerBlock;
    return dataCodewords.slice(start, start + version.dataCodewordsPerBlock);
  });
  const eccBlocks = dataBlocks.map((block) =>
    computeReedSolomonRemainder(block, version.eccCodewordsPerBlock),
  );

  return [
    ...interleaveQrBlocks(dataBlocks, version.dataCodewordsPerBlock),
    ...interleaveQrBlocks(eccBlocks, version.eccCodewordsPerBlock),
  ];
}

function interleaveQrBlocks(blocks: number[][], codewordsPerBlock: number): number[] {
  const output: number[] = [];
  for (let codewordIndex = 0; codewordIndex < codewordsPerBlock; codewordIndex += 1) {
    for (const block of blocks) {
      output.push(block[codewordIndex] ?? 0);
    }
  }
  return output;
}

function appendQrBits(bits: number[], value: number, length: number): void {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function computeReedSolomonRemainder(data: number[], degree: number): number[] {
  const generator = buildReedSolomonGenerator(degree);
  const result = [...data, ...Array.from({ length: degree }, () => 0)];

  for (let index = 0; index < data.length; index += 1) {
    const coefficient = result[index] ?? 0;
    if (coefficient === 0) continue;

    for (let generatorIndex = 0; generatorIndex < generator.length; generatorIndex += 1) {
      const resultIndex = index + generatorIndex;
      result[resultIndex] = (result[resultIndex] ?? 0) ^ reedSolomonMultiply(generator[generatorIndex] ?? 0, coefficient);
    }
  }

  return result.slice(result.length - degree);
}

function buildReedSolomonGenerator(degree: number): number[] {
  let generator = [1];
  for (let index = 0; index < degree; index += 1) {
    generator = reedSolomonMultiplyPoly(generator, [1, reedSolomonExp(index)]);
  }
  return generator;
}

function reedSolomonMultiplyPoly(left: number[], right: number[]): number[] {
  const result = Array.from({ length: left.length + right.length - 1 }, () => 0);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const resultIndex = leftIndex + rightIndex;
      result[resultIndex] = (result[resultIndex] ?? 0) ^ reedSolomonMultiply(left[leftIndex] ?? 0, right[rightIndex] ?? 0);
    }
  }
  return result;
}

function reedSolomonMultiply(left: number, right: number): number {
  let output = 0;
  let a = left;
  let b = right;
  while (b > 0) {
    if (b & 1) output ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
    b >>>= 1;
  }
  return output;
}

function reedSolomonExp(power: number): number {
  let output = 1;
  for (let index = 0; index < power; index += 1) {
    output = reedSolomonMultiply(output, 2);
  }
  return output;
}

function drawQrDataCodewords(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  codewords: number[],
): void {
  const bits = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, index) => (codeword >>> (7 - index)) & 1),
  );
  const size = modules.length;
  let bitIndex = 0;
  let upwards = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;

    for (let vertical = 0; vertical < size; vertical += 1) {
      const row = upwards ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;
        const module = getQrModule(modules, column, row);
        if (!module || module.reserved) continue;

        const bit = bits[bitIndex] ?? 0;
        const dark = bit === 1;
        setQrModule(modules, column, row, shouldApplyQrMask(column, row) ? !dark : dark, false);
        bitIndex += 1;
      }
    }
    upwards = !upwards;
  }

  drawQrFormatBits(modules);
  drawQrVersionBits(modules);
}

function shouldApplyQrMask(column: number, row: number): boolean {
  return (column + row) % 2 === 0;
}

function drawQrFormatBits(modules: Array<Array<{ dark: boolean; reserved: boolean }>>): void {
  const size = modules.length;
  const bits = getQrFormatBits();
  const first = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const second = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8], [size - 8, 8],
    [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4],
    [8, size - 3], [8, size - 2], [8, size - 1],
  ];

  for (let index = 0; index < bits.length; index += 1) {
    const firstPoint = first[index];
    const secondPoint = second[index];
    if (firstPoint)
      setQrModule(modules, firstPoint[0] ?? 0, firstPoint[1] ?? 0, bits[index] === 1, true);
    if (secondPoint)
      setQrModule(modules, secondPoint[0] ?? 0, secondPoint[1] ?? 0, bits[index] === 1, true);
  }
}

function getQrFormatBits(): number[] {
  const format = (0b01 << 3) | 0b000;
  let value = format << 10;
  const generator = 0b10100110111;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((value >>> bit) & 1) === 1) value ^= generator << (bit - 10);
  }
  const masked = ((format << 10) | value) ^ 0b101010000010010;
  return Array.from({ length: 15 }, (_, index) => (masked >>> index) & 1);
}

function drawQrVersionBits(modules: Array<Array<{ dark: boolean; reserved: boolean }>>): void {
  const version = (modules.length - 17) / 4;
  if (version < 7) return;

  const bits = getQrVersionBits(version);
  const size = modules.length;
  for (let index = 0; index < bits.length; index += 1) {
    const x = index % 3;
    const y = Math.floor(index / 3);
    const dark = bits[index] === 1;
    setQrModule(modules, size - 11 + x, y, dark, true);
    setQrModule(modules, y, size - 11 + x, dark, true);
  }
}

function getQrVersionBits(version: number): number[] {
  let value = version << 12;
  const generator = 0b1111100100101;
  for (let bit = 17; bit >= 12; bit -= 1) {
    if (((value >>> bit) & 1) === 1) value ^= generator << (bit - 12);
  }
  const encoded = (version << 12) | value;
  return Array.from({ length: 18 }, (_, index) => (encoded >>> index) & 1);
}

function renderQrSvg(modules: boolean[][], quietZone: number): string {
  const size = modules.length;
  const viewBoxSize = size + quietZone * 2;
  const rects: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (modules[row]?.[column]) {
        rects.push(`<rect x="${column + quietZone}" y="${row + quietZone}" width="1" height="1"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges"><rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`;
}

function reserveQrModule(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  column: number,
  row: number,
): void {
  const module = getQrModule(modules, column, row);
  if (!module) return;
  module.reserved = true;
}

function setQrModule(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  column: number,
  row: number,
  dark: boolean,
  reserved: boolean,
): void {
  const module = getQrModule(modules, column, row);
  if (!module) return;
  module.dark = dark;
  module.reserved ||= reserved;
}

function getQrModule(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  column: number,
  row: number,
): { dark: boolean; reserved: boolean } | null {
  if (!isQrCoordinateInBounds(modules, column, row)) return null;
  return modules[row]?.[column] ?? null;
}

function isQrCoordinateInBounds(
  modules: Array<Array<{ dark: boolean; reserved: boolean }>>,
  column: number,
  row: number,
): boolean {
  return row >= 0 && row < modules.length && column >= 0 && column < modules.length;
}

function parseShortIdLength(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_SHORT_ID_LENGTH;

  const match = trimmed.match(/\b(\d{1,2})\b/);
  if (!match) return DEFAULT_SHORT_ID_LENGTH;

  const length = Number(match[1]);
  if (
    !Number.isInteger(length) ||
    length < MIN_SHORT_ID_LENGTH ||
    length > MAX_SHORT_ID_LENGTH
  ) {
    return null;
  }
  return length;
}

function generateShortId(length: number): string | null {
  const getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (!getRandomValues) return null;

  const bytes = new Uint8Array(length);
  getRandomValues(bytes);
  let output = "";
  for (const byte of bytes) {
    output += SHORT_ID_ALPHABET[byte % SHORT_ID_ALPHABET.length];
  }
  return output;
}

function buildCasePayload(parsed: ParsedQuickOpsCommand): PreviewCardPayload {
  const output = convertCase(parsed.operation, parsed.input);
  return buildSimplePayload(parsed, output, {
    sections: [
      {
        rows: [
          {
            label: "输入来源",
            value: parsed.inputSource === "clipboard" ? "剪贴板" : "CoreBox 输入",
          },
          {
            label: "输入长度",
            value: parsed.input.length.toString(),
          },
        ],
      },
    ],
  });
}

function convertCase(operation: QuickOpsOperation, input: string): string {
  switch (operation) {
    case "case-upper":
      return input.toLocaleUpperCase();
    case "case-lower":
      return input.toLocaleLowerCase();
    case "case-camel":
      return toCamelCase(input);
    case "case-snake":
      return tokenizeCaseInput(input).join("_");
    case "case-kebab":
      return tokenizeCaseInput(input).join("-");
    default:
      return input;
  }
}

function toCamelCase(input: string): string {
  const words = tokenizeCaseInput(input);
  if (words.length === 0) return "";

  return words
    .map((word, index) => {
      if (index === 0) return word;
      return `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`;
    })
    .join("");
}

function tokenizeCaseInput(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim().toLocaleLowerCase())
    .filter(Boolean);
}

function buildSimplePayload(
  parsed: ParsedQuickOpsCommand,
  value: string,
  extra?: Partial<PreviewCardPayload>,
): PreviewCardPayload {
  return {
    abilityId: "preview.quickops.developer",
    title: OPERATION_LABELS[parsed.operation],
    subtitle: parsed.inputSource === "clipboard" ? "QuickOps · 剪贴板输入" : "QuickOps",
    primaryLabel: extra?.primaryLabel ?? "结果",
    primaryValue: value,
    secondaryLabel: extra?.secondaryLabel,
    secondaryValue: extra?.secondaryValue,
    badges: ["QuickOps"],
    sections: extra?.sections ?? [
      {
        rows: [
          {
            label: "输入来源",
            value: parsed.inputSource === "clipboard" ? "剪贴板" : "CoreBox 输入",
          },
        ],
      },
    ],
    warnings: extra?.warnings,
    meta: extra?.meta ?? {
      quickOps: {
        category: "developer",
        operation: parsed.operation,
        inputSource: parsed.inputSource,
        inputLength: parsed.input.length,
      },
    },
  };
}

function buildErrorPayload(parsed: ParsedQuickOpsCommand, message: string): PreviewCardPayload {
  return buildSimplePayload(parsed, message, {
    primaryLabel: "错误",
    secondaryLabel: "状态",
    secondaryValue: "处理失败",
    warnings: [message],
  });
}
