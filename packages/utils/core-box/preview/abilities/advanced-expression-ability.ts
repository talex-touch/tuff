import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import type { TuffQuery } from "../../tuff";
import { BasePreviewAbility } from "../sdk";
import { evaluateSafeMathExpression } from "./safe-math-expression";

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
  "of",
]);

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return value.toString();
  return (Math.round(value * 1e10) / 1e10).toString();
}

function hasOnlyAllowedAlphaTokens(expr: string): boolean {
  const tokens = expr.match(/[a-z]+/gi) ?? [];
  return tokens.every((token) => ALLOWED_ALPHA_TOKENS.has(token.toLowerCase()));
}

function hasOnlyAllowedExpressionChars(expr: string): boolean {
  return /^[\d+\-*/%^×÷().,\sA-Za-z]+$/u.test(expr);
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
    /(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%$/g,
    (_, base, op, pct) => `${base} * (1 ${op} ${pct}/100)`,
  );
  return normalized;
}

export class AdvancedExpressionAbility extends BasePreviewAbility {
  readonly id = "preview.expression.advanced";
  override readonly label = "Advanced Expression";
  readonly priority = 15;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 240,
      syntax:
        "numbers, arithmetic operators, parentheses, allowlisted math functions and constants",
      notes:
        "Evaluated by a deterministic parser without generic code or mathjs evaluation.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
    replacementPlan:
      "Completed: generic mathjs evaluation replaced by the shared allowlisted parser.",
  };

  override canHandle(query: TuffQuery): boolean {
    const text = query.text?.trim() ?? "";
    if (text.length < 2 || text.length > this.safety.input.maxLength)
      return false;
    if (!/\d/.test(text)) return false;

    const hasOperator = /[+\-*/%^×÷]/.test(text);
    const hasFunction =
      /\b(sqrt|sin|cos|tan|log|ln|abs|round|ceil|floor|pow|exp)\s*\(/i.test(
        text,
      );

    if (/^[/~]/.test(text) || /^https?:\/\//i.test(text)) return false;
    if (/^\d+\.\d+\.\d+/.test(text)) return false;
    if (!hasOnlyAllowedExpressionChars(text)) return false;
    if (!hasOnlyAllowedAlphaTokens(text)) return false;

    return hasOperator || hasFunction;
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const text = this.getNormalizedQuery(context.query);
    if (!text || !this.isInputWithinLimit(context)) return null;

    this.throwIfAborted(context.signal);
    const normalized = normalizeExpression(text);
    const result = evaluateSafeMathExpression(normalized);
    if (result === null) return null;

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
      badges: ["safe-parser"],
    };

    return {
      abilityId: this.id,
      confidence: 0.75,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }
}
