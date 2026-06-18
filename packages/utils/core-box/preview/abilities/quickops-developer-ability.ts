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
const UTC_OFFSET_PATTERN = /\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/i;

export class QuickOpsDeveloperAbility extends BasePreviewAbility {
  readonly id = "preview.quickops.developer";
  override readonly label = "QuickOps Developer";
  readonly priority = 42;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 5000,
      syntax:
        "QuickOps developer commands: json, url encode/decode, base64 encode/decode, jwt decode, regex test, markdown table, csv to markdown, markdown to csv, timestamp, date/timezone, uuid, short id, case upper/lower/camel/snake/kebab",
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
  if (hasRegexBacktrackingRisk(regexInput.pattern)) {
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

function hasRegexBacktrackingRisk(pattern: string): boolean {
  return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(pattern) || /\\[1-9]/.test(pattern);
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
  const widths = rows[0].map((_, columnIndex) =>
    Math.max(...rows.map((row) => row[columnIndex]?.length ?? 0), 3),
  );
  const formatRow = (row: string[]) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index], " ")).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;

  return [formatRow(rows[0]), separator, ...rows.slice(1).map(formatRow)].join("\n");
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
