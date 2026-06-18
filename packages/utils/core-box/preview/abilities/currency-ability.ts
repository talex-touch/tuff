import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import { BasePreviewAbility } from "../sdk";

export interface CurrencyRate {
  code: string;
  perUsd: number;
  name: string;
  decimals: number;
}

export interface ParsedCurrencyQuery {
  amount: number;
  source: string;
  target: string;
}

const CURRENCY_ALIASES: Record<string, string> = {
  美元: "USD",
  人民币: "CNY",
  元: "CNY",
  欧元: "EUR",
  日元: "JPY",
  英镑: "GBP",
  港币: "HKD",
  港元: "HKD",
  台币: "TWD",
  新台币: "TWD",
  韩元: "KRW",
  澳元: "AUD",
  加元: "CAD",
  新币: "SGD",
  新加坡元: "SGD",
  泰铢: "THB",
  越南盾: "VND",
  印度卢比: "INR",
  瑞士法郎: "CHF",
  比特币: "BTC",
  以太坊: "ETH",
  dollar: "USD",
  dollars: "USD",
  euro: "EUR",
  euros: "EUR",
  yen: "JPY",
  pound: "GBP",
  pounds: "GBP",
  yuan: "CNY",
  rmb: "CNY",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "¥": "CNY",
  "￥": "CNY",
  "€": "EUR",
  "£": "GBP",
  "₩": "KRW",
  "₫": "VND",
  "฿": "THB",
  "₿": "BTC",
  Ξ: "ETH",
};

const STATIC_CURRENCY_RATES: Record<string, CurrencyRate> = {
  USD: { code: "USD", perUsd: 1, name: "美元", decimals: 2 },
  CNY: { code: "CNY", perUsd: 7.25, name: "人民币", decimals: 2 },
  EUR: { code: "EUR", perUsd: 0.92, name: "欧元", decimals: 2 },
  JPY: { code: "JPY", perUsd: 151.2, name: "日元", decimals: 0 },
  GBP: { code: "GBP", perUsd: 0.79, name: "英镑", decimals: 2 },
  HKD: { code: "HKD", perUsd: 7.81, name: "港币", decimals: 2 },
  TWD: { code: "TWD", perUsd: 32.4, name: "新台币", decimals: 2 },
  KRW: { code: "KRW", perUsd: 1364, name: "韩元", decimals: 0 },
  AUD: { code: "AUD", perUsd: 1.49, name: "澳元", decimals: 2 },
  CAD: { code: "CAD", perUsd: 1.37, name: "加元", decimals: 2 },
  SGD: { code: "SGD", perUsd: 1.36, name: "新加坡元", decimals: 2 },
  THB: { code: "THB", perUsd: 36.4, name: "泰铢", decimals: 2 },
  VND: { code: "VND", perUsd: 24840, name: "越南盾", decimals: 0 },
  INR: { code: "INR", perUsd: 83.2, name: "印度卢比", decimals: 2 },
  CHF: { code: "CHF", perUsd: 0.86, name: "瑞士法郎", decimals: 2 },
  BTC: { code: "BTC", perUsd: 0.000018, name: "比特币", decimals: 8 },
  ETH: { code: "ETH", perUsd: 0.00026, name: "以太坊", decimals: 8 },
};

const CURRENCY_PATTERN =
  /^\s*(?:([$€¥£₩₫฿₿Ξ]|[a-z]{3}|[a-z]+|[\u4E00-\u9FA5]{1,8})\s*)?([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:([a-z]{3}|[a-z]+|[\u4E00-\u9FA5]{1,8})\s*)?(?:to|in|[=转换]|->)\s*([a-z]{3}|[a-z]+|[\u4E00-\u9FA5]{1,8})\s*$/i;

export class CurrencyPreviewAbility extends BasePreviewAbility {
  readonly id = "preview.currency";
  override readonly label = "Currency";
  readonly priority = 38;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 120,
      syntax: "currency amount conversion, e.g. 10 USD to CNY",
      notes:
        "Uses static fallback exchange rates only; CoreApp may override with live/cache-backed adapter.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
    replacementPlan:
      "Static fallback migrated to PreviewSDK. CoreApp realtime Nexus/cache adapter may still override this ability at runtime.",
  };

  override canHandle(query: { text?: string }): boolean {
    if (!query.text || query.text.length > this.safety.input.maxLength) return false;
    return parseCurrencyQuery(query.text) !== null;
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const text = this.getNormalizedQuery(context.query);
    if (!this.isInputWithinLimit(context)) return null;

    const parsed = parseCurrencyQuery(text);
    if (!parsed) return null;

    this.throwIfAborted(context.signal);
    const source = STATIC_CURRENCY_RATES[parsed.source];
    const target = STATIC_CURRENCY_RATES[parsed.target];
    if (!source || !target) return null;

    const rate = target.perUsd / source.perUsd;
    const converted = parsed.amount * rate;
    const usdValue = parsed.amount / source.perUsd;
    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: `${parsed.amount} ${source.code} → ${target.code}`,
      subtitle: "汇率换算 · 静态离线基准",
      primaryLabel: `${source.name} → ${target.name}`,
      primaryValue: formatCurrencyAmount(converted, target),
      secondaryLabel: "折合美元",
      secondaryValue: formatCurrencyAmount(usdValue, STATIC_CURRENCY_RATES.USD),
      badges: ["Offline"],
      chips: [
        { label: "汇率", value: `1 ${source.code} = ${rate.toFixed(6)} ${target.code}` },
        { label: "数据源", value: "STATIC" },
      ],
      sections: [
        {
          title: "详情",
          rows: [
            { label: "源金额", value: `${parsed.amount} ${source.code}` },
            { label: "目标金额", value: formatCurrencyAmount(converted, target), copyable: true },
            { label: "汇率", value: rate.toFixed(6), copyable: true },
          ],
        },
      ],
      warnings: ["使用静态离线汇率，结果仅适合快速估算"],
      meta: {
        currency: {
          source: source.code,
          target: target.code,
          rate,
          rateSource: "static",
        },
      },
    };

    return {
      abilityId: this.id,
      confidence: 0.68,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }
}

export function parseCurrencyQuery(input: string): ParsedCurrencyQuery | null {
  const match = CURRENCY_PATTERN.exec(input.trim());
  if (!match) return null;

  const [, symbolOrPrefix, amountRaw, sourceRaw, targetRaw] = match;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return null;

  const source = normalizeCurrency(sourceRaw || symbolOrPrefix || "USD");
  const target = normalizeCurrency(targetRaw);
  if (!source || !target || source === target) return null;

  return {
    amount,
    source,
    target,
  };
}

export function normalizeCurrency(input: string): string | null {
  const trimmed = input.trim();
  const code = trimmed.toUpperCase();
  if (STATIC_CURRENCY_RATES[code]) return code;

  const symbol = CURRENCY_SYMBOLS[trimmed];
  if (symbol) return symbol;

  const alias = CURRENCY_ALIASES[trimmed.toLowerCase()];
  if (alias && STATIC_CURRENCY_RATES[alias]) return alias;

  return null;
}

function formatCurrencyAmount(amount: number, currency: CurrencyRate): string {
  return `${amount.toFixed(currency.decimals)} ${currency.code}`;
}
