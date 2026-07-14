import { describe, expect, it } from "vitest";
import { resolveLocalizedText, UNIT_LEXICON_ENTRIES } from "../../i18n";
import {
  convertUnit,
  parseUnitConversion,
  resolveUnit,
} from "../../core-box/preview/abilities/unit-conversion-core";

describe("unit conversion core", () => {
  it.each([
    ["length", 1, "km", "m", 1000],
    ["temperature", 32, "F", "C", 0],
    ["imperial length", 1, "mi", "km", 1.609344],
    ["data", 8, "bit", "B", 1],
  ] as const)(
    "preserves %s conversion math",
    (_name, value, fromUnit, toUnit, expected) => {
      const result = convertUnit(value, fromUnit, toUnit);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          value: expected,
          fromUnit,
          toUnit,
        }),
      );
    },
  );

  it.each([
    ["zh-CN", "2 公里 to meters", "千米", "米"],
    ["en-US", "2 公里 to meters", "kilometer", "meter"],
    ["zh-CN", "2 kilometers to 米", "千米", "米"],
    ["en-US", "2 kilometers to 米", "kilometer", "meter"],
  ] as const)(
    "parses mixed Chinese and English aliases under %s",
    (locale, query, fromLabel, toLabel) => {
      const result = parseUnitConversion(query, locale);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          value: 2000,
          fromUnit: "km",
          toUnit: "m",
          fromLabel,
          toLabel,
        }),
      );
    },
  );

  it("provides canonical IDs and a working conversion for every exported unit baseline", () => {
    for (const entry of UNIT_LEXICON_ENTRIES) {
      const symbol = entry.metadata?.symbol;
      expect(entry.id).toMatch(/^unit\.[^.]+\.[^.]+$/);
      expect(typeof symbol).toBe("string");
      if (typeof symbol !== "string") continue;

      const definition = resolveUnit(symbol, "en-US");
      const chinese = convertUnit(1, symbol, symbol, "zh-CN");
      const english = convertUnit(1, symbol, symbol, "en-US");

      expect(definition).toEqual(expect.objectContaining({ id: entry.id }));
      expect(chinese).toEqual(
        expect.objectContaining({
          success: true,
          value: 1,
          fromLabel: resolveLocalizedText(entry.labels, "zh-CN"),
          toLabel: resolveLocalizedText(entry.labels, "zh-CN"),
        }),
      );
      expect(english).toEqual(
        expect.objectContaining({
          success: true,
          value: 1,
          fromLabel: resolveLocalizedText(entry.labels, "en-US"),
          toLabel: resolveLocalizedText(entry.labels, "en-US"),
        }),
      );
    }
  });

  it("returns explicit failures for unknown and cross-category conversions", () => {
    const unknown = convertUnit(10, "unknown-unit", "m", "en-US");
    const crossCategory = convertUnit(10, "kg", "m", "zh-CN");

    expect(unknown).toEqual(
      expect.objectContaining({
        success: false,
        fromValue: 10,
        fromUnit: "unknown-unit",
        toUnit: "m",
        error: expect.stringContaining("Unknown unit"),
      }),
    );
    expect(crossCategory).toEqual(
      expect.objectContaining({
        success: false,
        fromValue: 10,
        fromUnit: "kg",
        toUnit: "m",
        error: expect.stringContaining("Cannot convert"),
      }),
    );
  });

  it("keeps exact KB and Kb symbols distinct for byte and bit conversion", () => {
    expect(resolveUnit("KB", "en-US")).toEqual(
      expect.objectContaining({ id: "unit.data.kilobyte" }),
    );
    expect(resolveUnit("Kb", "en-US")).toEqual(
      expect.objectContaining({ id: "unit.data.kilobit" }),
    );
    expect(parseUnitConversion("1 KB to bit", "en-US")).toEqual(
      expect.objectContaining({ success: true, value: 8192 }),
    );
    expect(parseUnitConversion("1 Kb to B", "en-US")).toEqual(
      expect.objectContaining({ success: true, value: 128 }),
    );
  });
});
