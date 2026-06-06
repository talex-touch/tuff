import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import type { TuffQuery } from "../../tuff";
import { BasePreviewAbility } from "../sdk";
import { evaluateBasicExpression } from "./basic-expression-ability";

type MathJsInstance = ReturnType<(typeof import("mathjs"))["create"]>;

let mathjs: MathJsInstance | null = null;

async function getMathJs(): Promise<MathJsInstance | null> {
  if (!mathjs) {
    try {
      const m = await import("mathjs");
      if (!m.all) return null;
      mathjs = m.create(m.all, { number: "BigNumber", precision: 64 });
    } catch {
      return null;
    }
  }
  return mathjs;
}

function formatNumber(value: unknown): string {
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) return "";
    if (Number.isInteger(value)) return value.toString();
    return (Math.round(value * 1e10) / 1e10).toString();
  }
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const toNumber = (value as { toNumber?: () => unknown }).toNumber;
    if (typeof toNumber === "function") {
      const num = toNumber.call(value);
      if (typeof num === "number") {
        if (!Number.isFinite(num)) return "";
        if (Number.isInteger(num)) return num.toString();
        return (Math.round(num * 1e10) / 1e10).toString();
      }
      return String(num);
    }
  }
  return String(value);
}

const DANGEROUS_PATTERNS = [
  /import\s*\(/i,
  /require\s*\(/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /\bprocess\b/i,
  /\bglobal\b/i,
];
const ALLOWED_ALPHA_TOKENS = new Set([
  "sqrt",
  "sin",
  "cos",
  "tan",
  "log",
  "ln",
  "abs",
  "round",
  "ceil",
  "floor",
  "pow",
  "exp",
  "pi",
  "e",
]);

function isSafe(expr: string): boolean {
  return !DANGEROUS_PATTERNS.some((pattern) => pattern.test(expr));
}

function hasOnlyAllowedAlphaTokens(expr: string): boolean {
  const tokens = expr.match(/[a-z]+/gi) ?? [];
  return tokens.every((token) => ALLOWED_ALPHA_TOKENS.has(token.toLowerCase()));
}

function hasOnlyAllowedExpressionChars(expr: string): boolean {
  return /^[\d+\-*/^×÷().,\sA-Za-z]+$/u.test(expr);
}

function normalizeExpression(expr: string): string {
  let normalized = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .trim();

  normalized = normalized.replace(
    /(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi,
    (_, pct, base) => `${base} * (${pct}/100)`,
  );

  normalized = normalized.replace(
    /(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%$/,
    (_, base, op, pct) => `${base} * (1 ${op} ${pct}/100)`,
  );

  return normalized;
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === delimiter && depth === 0) {
      parts.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(input.slice(start).trim());
  return parts;
}

function splitTopLevelPower(input: string): [string, string] | null {
  let depth = 0;

  for (let index = input.length - 1; index >= 0; index -= 1) {
    const char = input[index];
    if (char === ")") depth += 1;
    if (char === "(") depth -= 1;
    if (char === "^" && depth === 0) {
      return [input.slice(0, index).trim(), input.slice(index + 1).trim()];
    }
  }

  return null;
}

function evaluateStaticAdvancedExpression(expression: string): number | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;

  const functionMatch = /^([a-z]+)\((.*)\)$/i.exec(trimmed);
  if (functionMatch) {
    const name = functionMatch[1]!.toLowerCase();
    const args = splitTopLevel(functionMatch[2]!, ",");

    if (name === "pow" && args.length === 2) {
      const base = evaluateStaticAdvancedExpression(args[0]!);
      const exponent = evaluateStaticAdvancedExpression(args[1]!);
      return typeof base === "number" && typeof exponent === "number"
        ? base ** exponent
        : null;
    }

    if (args.length === 1) {
      const value = evaluateStaticAdvancedExpression(args[0]!);
      if (typeof value !== "number") return null;

      switch (name) {
        case "sqrt":
          return Math.sqrt(value);
        case "sin":
          return Math.sin(value);
        case "cos":
          return Math.cos(value);
        case "tan":
          return Math.tan(value);
        case "log":
          return Math.log10(value);
        case "ln":
          return Math.log(value);
        case "abs":
          return Math.abs(value);
        case "round":
          return Math.round(value);
        case "ceil":
          return Math.ceil(value);
        case "floor":
          return Math.floor(value);
        case "exp":
          return Math.exp(value);
      }
    }

    return null;
  }

  const power = splitTopLevelPower(trimmed);
  if (power) {
    const base = evaluateStaticAdvancedExpression(power[0]);
    const exponent = evaluateStaticAdvancedExpression(power[1]);
    return typeof base === "number" && typeof exponent === "number"
      ? base ** exponent
      : null;
  }

  const expressionWithConstants = trimmed
    .replace(/\bpi\b/gi, String(Math.PI))
    .replace(/\be\b/gi, String(Math.E));

  return evaluateBasicExpression(expressionWithConstants);
}

function isFiniteStaticResult(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class AdvancedExpressionAbility extends BasePreviewAbility {
  readonly id = "preview.expression.advanced";
  override readonly label = "Advanced Expression";
  readonly priority = 15;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 240,
      syntax:
        "mathjs expression with numbers, operators, whitelisted math functions and constants",
      notes: "Guarded by dangerous token checks and mathjs parser evaluation.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
    replacementPlan:
      "Completed: moved into PreviewSDK with mathjs parser boundary declared.",
  };

  override canHandle(query: TuffQuery): boolean {
    const text = query.text?.trim() ?? "";
    if (text.length < 2 || text.length > this.safety.input.maxLength)
      return false;
    if (!/\d/.test(text)) return false;

    const hasOperator = /[+\-*/^×÷]/.test(text);
    const hasFunction =
      /\b(sqrt|sin|cos|tan|log|ln|abs|round|ceil|floor|pow|exp|pi|e)\s*\(/i.test(
        text,
      );
    const hasPower = /\^/.test(text);

    if (/^[/~]/.test(text) || /^https?:\/\//i.test(text)) return false;
    if (/^\d+\.\d+\.\d+/.test(text)) return false;
    if (!hasOnlyAllowedExpressionChars(text)) return false;
    if (!hasOnlyAllowedAlphaTokens(text)) return false;

    return hasOperator || hasFunction || hasPower;
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const text = this.getNormalizedQuery(context.query);
    if (!text || !this.isInputWithinLimit(context) || !isSafe(text))
      return null;

    this.throwIfAborted(context.signal);

    try {
      const normalized = normalizeExpression(text);
      const staticResult = evaluateStaticAdvancedExpression(normalized);
      const result = isFiniteStaticResult(staticResult)
        ? staticResult
        : await this.evaluateWithMathJs(normalized);

      if (
        result === undefined ||
        result === null ||
        typeof result === "function"
      ) {
        return null;
      }

      const formatted = formatNumber(result);
      if (!formatted) return null;

      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: "高级计算",
        primaryLabel: "结果",
        primaryValue: formatted,
        sections: [
          {
            rows: [
              { label: "表达式", value: text },
              { label: "标准化", value: normalized },
            ],
          },
        ],
        badges: ["mathjs"],
      };

      return {
        abilityId: this.id,
        confidence: 0.75,
        payload,
        durationMs: Date.now() - startedAt,
      };
    } catch {
      return null;
    }
  }

  private async evaluateWithMathJs(expression: string): Promise<unknown> {
    const math = await getMathJs();
    return math ? math.evaluate(expression) : null;
  }
}
