export interface UnitDefinition {
  category: string;
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
  category?: string;
  formatted?: string;
  error?: string;
}

export interface ParsedUnitQuery {
  value: number;
  fromUnit: string;
  toUnit?: string;
}

const LINEAR = (
  factor: number,
): Pick<UnitDefinition, "toBase" | "fromBase"> => ({
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
};

const UNIT_DEFINITIONS: UnitDefinition[] = [
  unit(
    "length",
    "km",
    "千米",
    ["千米", "公里", "kilometer", "kilometers", "kilometre", "kilometres"],
    LINEAR(1000),
  ),
  unit(
    "length",
    "m",
    "米",
    ["米", "公尺", "meter", "meters", "metre", "metres"],
    LINEAR(1),
  ),
  unit(
    "length",
    "cm",
    "厘米",
    ["厘米", "centimeter", "centimeters"],
    LINEAR(0.01),
  ),
  unit(
    "length",
    "mm",
    "毫米",
    ["毫米", "millimeter", "millimeters"],
    LINEAR(0.001),
  ),
  unit("length", "mi", "英里", ["英里", "mile", "miles"], LINEAR(1609.344)),
  unit("length", "yd", "码", ["码", "yard", "yards"], LINEAR(0.9144)),
  unit("length", "ft", "英尺", ["英尺", "foot", "feet"], LINEAR(0.3048)),
  unit("length", "in", "英寸", ["英寸", "inch", "inches"], LINEAR(0.0254)),

  unit("mass", "t", "吨", ["吨", "ton", "tons", "tonne"], LINEAR(1000)),
  unit(
    "mass",
    "kg",
    "千克",
    ["千克", "公斤", "kilogram", "kilograms"],
    LINEAR(1),
  ),
  unit("mass", "g", "克", ["克", "gram", "grams"], LINEAR(0.001)),
  unit(
    "mass",
    "mg",
    "毫克",
    ["毫克", "milligram", "milligrams"],
    LINEAR(0.000001),
  ),
  unit("mass", "lb", "磅", ["磅", "pound", "pounds"], LINEAR(0.45359237)),
  unit("mass", "oz", "盎司", ["盎司", "ounce", "ounces"], LINEAR(0.0283495231)),
  unit("mass", "斤", "斤", [], LINEAR(0.5)),
  unit("mass", "两", "两", [], LINEAR(0.05)),

  unit(
    "temperature",
    "C",
    "摄氏度",
    ["℃", "摄氏度", "c", "celsius"],
    TEMPERATURE.celsius,
  ),
  unit(
    "temperature",
    "F",
    "华氏度",
    ["℉", "华氏度", "f", "fahrenheit"],
    TEMPERATURE.fahrenheit,
  ),
  unit(
    "temperature",
    "K",
    "开尔文",
    ["开尔文", "k", "kelvin"],
    TEMPERATURE.kelvin,
  ),

  unit("data", "B", "字节", ["字节", "byte", "bytes"], LINEAR(1)),
  unit(
    "data",
    "KB",
    "千字节",
    ["千字节", "kilobyte", "kilobytes", "kb"],
    LINEAR(1024),
  ),
  unit(
    "data",
    "MB",
    "兆字节",
    ["兆字节", "megabyte", "megabytes", "mb"],
    LINEAR(1024 ** 2),
  ),
  unit(
    "data",
    "GB",
    "吉字节",
    ["吉字节", "gigabyte", "gigabytes", "gb"],
    LINEAR(1024 ** 3),
  ),
  unit(
    "data",
    "TB",
    "太字节",
    ["太字节", "terabyte", "terabytes", "tb"],
    LINEAR(1024 ** 4),
  ),
  unit("data", "bit", "比特", ["比特", "bits"], LINEAR(0.125)),
  unit("data", "Kb", "千比特", ["千比特", "kilobit", "kilobits"], LINEAR(128)),
  unit(
    "data",
    "Mb",
    "兆比特",
    ["兆比特", "megabit", "megabits"],
    LINEAR(131072),
  ),
  unit(
    "data",
    "Gb",
    "吉比特",
    ["吉比特", "gigabit", "gigabits"],
    LINEAR(134217728),
  ),

  unit("time", "s", "秒", ["秒", "sec", "second", "seconds"], LINEAR(1)),
  unit(
    "time",
    "ms",
    "毫秒",
    ["毫秒", "millisecond", "milliseconds"],
    LINEAR(0.001),
  ),
  unit("time", "min", "分钟", ["分", "分钟", "minute", "minutes"], LINEAR(60)),
  unit("time", "h", "小时", ["小时", "hour", "hours", "hr"], LINEAR(3600)),
  unit("time", "d", "天", ["天", "日", "day", "days"], LINEAR(86400)),
  unit("time", "w", "周", ["周", "星期", "week", "weeks"], LINEAR(604800)),

  unit(
    "area",
    "km2",
    "平方千米",
    ["平方千米", "平方公里", "sq km"],
    LINEAR(1000000),
  ),
  unit("area", "m2", "平方米", ["平方米", "sq m", "sqm"], LINEAR(1)),
  unit("area", "cm2", "平方厘米", ["平方厘米", "sq cm"], LINEAR(0.0001)),
  unit("area", "ha", "公顷", ["公顷", "hectare", "hectares"], LINEAR(10000)),
  unit("area", "acre", "英亩", ["英亩", "acres"], LINEAR(4046.86)),
  unit(
    "area",
    "ft2",
    "平方英尺",
    ["平方英尺", "sq ft", "sqft"],
    LINEAR(0.092903),
  ),

  unit("volume", "L", "升", ["升", "l", "liter", "liters", "litre"], LINEAR(1)),
  unit(
    "volume",
    "mL",
    "毫升",
    ["毫升", "ml", "milliliter", "milliliters"],
    LINEAR(0.001),
  ),
  unit("volume", "m3", "立方米", ["立方米", "cubic meter"], LINEAR(1000)),
  unit("volume", "gal", "加仑", ["加仑", "gallon", "gallons"], LINEAR(3.78541)),
  unit("volume", "qt", "夸脱", ["夸脱", "quart", "quarts"], LINEAR(0.946353)),
  unit("volume", "pt", "品脱", ["品脱", "pint", "pints"], LINEAR(0.473176)),
  unit("volume", "cup", "杯", ["杯"], LINEAR(0.236588)),
  unit(
    "volume",
    "fl oz",
    "液体盎司",
    ["液体盎司", "fluid ounce"],
    LINEAR(0.0295735),
  ),

  unit("speed", "m/s", "米每秒", ["米每秒", "meters per second"], LINEAR(1)),
  unit(
    "speed",
    "km/h",
    "千米每小时",
    ["千米每小时", "公里每小时", "kph", "kmh"],
    LINEAR(0.277778),
  ),
  unit(
    "speed",
    "mph",
    "英里每小时",
    ["英里每小时", "miles per hour"],
    LINEAR(0.44704),
  ),
  unit("speed", "knot", "节", ["节", "knots", "kn"], LINEAR(0.514444)),
  unit(
    "speed",
    "ft/s",
    "英尺每秒",
    ["英尺每秒", "feet per second", "fps"],
    LINEAR(0.3048),
  ),
];

const ALIAS_MAP = new Map<string, UnitDefinition>();

for (const definition of UNIT_DEFINITIONS) {
  ALIAS_MAP.set(definition.unit.toLowerCase(), definition);
  for (const alias of definition.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), definition);
  }
}

const UNIT_QUERY_PATTERN =
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z\u4E00-\u9FA5°℃℉/0-9 ]+?)(?:\s*(?:to|in|=|->|转|换算|换成)\s*([a-z\u4E00-\u9FA5°℃℉/0-9 ]+)\s*)?$/i;

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  length: ["m", "ft", "in", "km"],
  mass: ["kg", "lb", "t", "g"],
  volume: ["L", "mL", "gal"],
  data: ["KB", "MB", "GB"],
  temperature: ["C", "F", "K"],
  time: ["min", "h", "d"],
  area: ["m2", "ft2", "acre"],
  speed: ["km/h", "mph", "m/s"],
};

function unit(
  category: string,
  unitName: string,
  display: string,
  aliases: string[],
  conversion: Pick<UnitDefinition, "toBase" | "fromBase">,
): UnitDefinition {
  return {
    category,
    unit: unitName,
    display,
    aliases,
    ...conversion,
  };
}

export function resolveUnit(input: string): UnitDefinition | null {
  const normalized = input.trim().toLowerCase();
  return ALIAS_MAP.get(normalized) ?? null;
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
): UnitConversionResult {
  const from = resolveUnit(fromUnit);
  const to = resolveUnit(toUnit);

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
    category: from.category,
    formatted: `${value} ${from.unit} = ${rounded} ${to.unit}`,
  };
}

export function parseUnitConversion(
  query: string,
): UnitConversionResult | null {
  const parsed = parseUnitQuery(query);
  if (!parsed?.toUnit) return null;
  return convertUnit(parsed.value, parsed.fromUnit, parsed.toUnit);
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
): UnitDefinition[] {
  return (CATEGORY_SUGGESTIONS[category] ?? [])
    .filter((unitName) => unitName.toLowerCase() !== sourceUnit.toLowerCase())
    .map((unitName) => resolveUnit(unitName))
    .filter((definition): definition is UnitDefinition => Boolean(definition));
}

export function getAvailableCategories(): string[] {
  return Array.from(
    new Set(UNIT_DEFINITIONS.map((definition) => definition.category)),
  );
}

export function getUnitsInCategory(category: string): string[] {
  return UNIT_DEFINITIONS.filter(
    (definition) => definition.category === category,
  ).map((definition) => definition.unit);
}
