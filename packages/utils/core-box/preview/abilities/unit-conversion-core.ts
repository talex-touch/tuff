import type {
  AppLocale,
  DomainLexiconEntry,
  UnitCategory,
} from "../../../i18n";
import {
  isUnitLexiconMetadata,
  officialDomainLexiconRegistry,
  UNIT_CATEGORIES,
  UNIT_LEXICON_ENTRIES,
} from "../../../i18n";

export interface UnitDefinition {
  id: string;
  category: UnitCategory;
  unit: string;
  display: string;
  aliases: string[];
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

export interface UnitConversionResult {
  success: boolean;
  value?: number;
  fromValue: number;
  fromUnit: string;
  toUnit: string;
  fromLabel?: string;
  toLabel?: string;
  category?: UnitCategory;
  formatted?: string;
  error?: string;
}

export interface ParsedUnitQuery {
  value: number;
  fromUnit: string;
  toUnit?: string;
}

type UnitConversion = Pick<UnitDefinition, "toBase" | "fromBase">;

const DEFAULT_UNIT_LOCALE: AppLocale = "zh-CN";

const LINEAR = (factor: number): UnitConversion => ({
  toBase: (value) => value * factor,
  fromBase: (value) => value / factor,
});

const TEMPERATURE = {
  celsius: {
    toBase: (value: number) => value + 273.15,
    fromBase: (value: number) => value - 273.15,
  },
  fahrenheit: {
    toBase: (value: number) => ((value - 32) * 5) / 9 + 273.15,
    fromBase: (value: number) => ((value - 273.15) * 9) / 5 + 32,
  },
  kelvin: {
    toBase: (value: number) => value,
    fromBase: (value: number) => value,
  },
} satisfies Record<string, UnitConversion>;

const UNIT_CONVERSIONS: Readonly<Record<string, UnitConversion>> =
  Object.freeze({
    "unit.length.kilometer": LINEAR(1000),
    "unit.length.meter": LINEAR(1),
    "unit.length.centimeter": LINEAR(0.01),
    "unit.length.millimeter": LINEAR(0.001),
    "unit.length.mile": LINEAR(1609.344),
    "unit.length.yard": LINEAR(0.9144),
    "unit.length.foot": LINEAR(0.3048),
    "unit.length.inch": LINEAR(0.0254),

    "unit.mass.tonne": LINEAR(1000),
    "unit.mass.kilogram": LINEAR(1),
    "unit.mass.gram": LINEAR(0.001),
    "unit.mass.milligram": LINEAR(0.000001),
    "unit.mass.pound": LINEAR(0.45359237),
    "unit.mass.ounce": LINEAR(0.0283495231),
    "unit.mass.jin": LINEAR(0.5),
    "unit.mass.liang": LINEAR(0.05),

    "unit.temperature.celsius": TEMPERATURE.celsius,
    "unit.temperature.fahrenheit": TEMPERATURE.fahrenheit,
    "unit.temperature.kelvin": TEMPERATURE.kelvin,

    "unit.data.byte": LINEAR(1),
    "unit.data.kilobyte": LINEAR(1024),
    "unit.data.megabyte": LINEAR(1024 ** 2),
    "unit.data.gigabyte": LINEAR(1024 ** 3),
    "unit.data.terabyte": LINEAR(1024 ** 4),
    "unit.data.bit": LINEAR(0.125),
    "unit.data.kilobit": LINEAR(128),
    "unit.data.megabit": LINEAR(131072),
    "unit.data.gigabit": LINEAR(134217728),

    "unit.time.second": LINEAR(1),
    "unit.time.millisecond": LINEAR(0.001),
    "unit.time.minute": LINEAR(60),
    "unit.time.hour": LINEAR(3600),
    "unit.time.day": LINEAR(86400),
    "unit.time.week": LINEAR(604800),

    "unit.area.square-kilometer": LINEAR(1000000),
    "unit.area.square-meter": LINEAR(1),
    "unit.area.square-centimeter": LINEAR(0.0001),
    "unit.area.hectare": LINEAR(10000),
    "unit.area.acre": LINEAR(4046.86),
    "unit.area.square-foot": LINEAR(0.092903),

    "unit.volume.liter": LINEAR(1),
    "unit.volume.milliliter": LINEAR(0.001),
    "unit.volume.cubic-meter": LINEAR(1000),
    "unit.volume.gallon": LINEAR(3.78541),
    "unit.volume.quart": LINEAR(0.946353),
    "unit.volume.pint": LINEAR(0.473176),
    "unit.volume.cup": LINEAR(0.236588),
    "unit.volume.fluid-ounce": LINEAR(0.0295735),

    "unit.speed.meter-per-second": LINEAR(1),
    "unit.speed.kilometer-per-hour": LINEAR(0.277778),
    "unit.speed.mile-per-hour": LINEAR(0.44704),
    "unit.speed.knot": LINEAR(0.514444),
    "unit.speed.foot-per-second": LINEAR(0.3048),
  });

export const unitLexiconRegistry = officialDomainLexiconRegistry;

const UNIT_QUERY_PATTERN =
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z\u4E00-\u9FA5°℃℉/0-9 ]+?)(?:\s*(?:to|in|=|->|转|换算|换成)\s*([a-z\u4E00-\u9FA5°℃℉/0-9 ]+)\s*)?$/i;

const CATEGORY_SUGGESTIONS: Record<UnitCategory, string[]> = {
  length: ["m", "ft", "in", "km"],
  mass: ["kg", "lb", "t", "g"],
  volume: ["L", "mL", "gal"],
  data: ["KB", "MB", "GB"],
  temperature: ["C", "F", "K"],
  time: ["min", "h", "d"],
  area: ["m2", "ft2", "acre"],
  speed: ["km/h", "mph", "m/s"],
};

validateUnitLexiconCoverage();

export function resolveUnit(
  input: string,
  locale: AppLocale = DEFAULT_UNIT_LOCALE,
): UnitDefinition | null {
  const match = unitLexiconRegistry.matchAlias(input, {
    domain: "unit",
    locale,
  });
  return match ? createUnitDefinition(match.entry, locale) : null;
}

export function parseUnitQuery(query: string): ParsedUnitQuery | null {
  const match = query.trim().match(UNIT_QUERY_PATTERN);
  if (!match) return null;

  const [, valueRaw, fromUnit, toUnit] = match;
  if (!valueRaw || !fromUnit) return null;

  const value = Number(valueRaw);
  if (Number.isNaN(value)) return null;

  return {
    value,
    fromUnit: fromUnit.trim(),
    toUnit: toUnit?.trim(),
  };
}

export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
  locale: AppLocale = DEFAULT_UNIT_LOCALE,
): UnitConversionResult {
  const from = resolveUnit(fromUnit, locale);
  const to = resolveUnit(toUnit, locale);

  if (!from) {
    return {
      success: false,
      fromValue: value,
      fromUnit,
      toUnit,
      error: `Unknown unit: ${fromUnit}`,
    };
  }

  if (!to) {
    return {
      success: false,
      fromValue: value,
      fromUnit,
      toUnit,
      error: `Unknown unit: ${toUnit}`,
    };
  }

  if (from.category !== to.category) {
    return {
      success: false,
      fromValue: value,
      fromUnit,
      toUnit,
      fromLabel: from.display,
      toLabel: to.display,
      error: `Cannot convert between ${from.category} and ${to.category}`,
    };
  }

  const baseValue = from.toBase(value);
  const result = to.fromBase(baseValue);
  const rounded = Math.round(result * 1e10) / 1e10;

  return {
    success: true,
    value: rounded,
    fromValue: value,
    fromUnit: from.unit,
    toUnit: to.unit,
    fromLabel: from.display,
    toLabel: to.display,
    category: from.category,
    formatted: `${value} ${from.unit} = ${rounded} ${to.unit}`,
  };
}

export function parseUnitConversion(
  query: string,
  locale: AppLocale = DEFAULT_UNIT_LOCALE,
): UnitConversionResult | null {
  const parsed = parseUnitQuery(query);
  if (!parsed?.toUnit) return null;
  return convertUnit(parsed.value, parsed.fromUnit, parsed.toUnit, locale);
}

export function looksLikeUnitConversion(query: string): boolean {
  const parsed = parseUnitQuery(query);
  return Boolean(parsed?.toUnit);
}

export function formatUnitNumber(value: number): string {
  if (!Number.isFinite(value)) return value.toString();
  if (Math.abs(value) >= 1) {
    return Number(value.toFixed(4)).toString();
  }
  return Number(value.toPrecision(4)).toString();
}

export function getUnitSuggestions(
  category: string,
  sourceUnit: string,
  locale: AppLocale = DEFAULT_UNIT_LOCALE,
): UnitDefinition[] {
  if (!isUnitCategory(category)) return [];
  const source = resolveUnit(sourceUnit, locale);

  return CATEGORY_SUGGESTIONS[category]
    .map((unitName) => resolveUnit(unitName, locale))
    .filter((definition): definition is UnitDefinition =>
      Boolean(definition && definition.id !== source?.id),
    );
}

export function getAvailableCategories(): UnitCategory[] {
  return [...UNIT_CATEGORIES];
}

export function getUnitsInCategory(category: string): string[] {
  if (!isUnitCategory(category)) return [];
  return UNIT_LEXICON_ENTRIES.filter((entry) => {
    return (
      isUnitLexiconMetadata(entry.metadata) &&
      entry.metadata.category === category
    );
  }).map((entry) => {
    if (!isUnitLexiconMetadata(entry.metadata)) {
      throw new Error(`Invalid unit lexicon metadata: ${entry.id}`);
    }
    return entry.metadata.symbol;
  });
}

function createUnitDefinition(
  entry: DomainLexiconEntry,
  locale: AppLocale,
): UnitDefinition | null {
  if (!isUnitLexiconMetadata(entry.metadata)) return null;
  const conversion = UNIT_CONVERSIONS[entry.id];
  if (!conversion) return null;
  const resolved = unitLexiconRegistry.resolve(entry.id, locale);
  if (!resolved) return null;

  return {
    id: entry.id,
    category: entry.metadata.category,
    unit: entry.metadata.symbol,
    display: resolved.label,
    aliases: collectAllAliases(entry),
    ...conversion,
  };
}

function collectAllAliases(entry: DomainLexiconEntry): string[] {
  return Array.from(
    new Set([
      ...entry.aliases.default,
      ...Object.values(entry.aliases.locales ?? {}).flatMap(
        (aliases) => aliases ?? [],
      ),
    ]),
  );
}

function isUnitCategory(category: string): category is UnitCategory {
  return (UNIT_CATEGORIES as readonly string[]).includes(category);
}

function validateUnitLexiconCoverage(): void {
  const entryIds = new Set<string>();
  for (const entry of UNIT_LEXICON_ENTRIES) {
    if (!isUnitLexiconMetadata(entry.metadata)) {
      throw new Error(`Invalid unit lexicon metadata: ${entry.id}`);
    }
    if (!UNIT_CONVERSIONS[entry.id]) {
      throw new Error(`Missing unit conversion mapping: ${entry.id}`);
    }
    entryIds.add(entry.id);
  }

  for (const id of Object.keys(UNIT_CONVERSIONS)) {
    if (!entryIds.has(id)) {
      throw new Error(`Missing unit lexicon entry: ${id}`);
    }
  }
}
