import { afterEach, describe, expect, it } from "vitest";
import {
  DomainLexiconRegistry,
  type DomainLexiconEntry,
} from "../../i18n/lexicon";
import { ScopedDomainLexiconRegistry } from "../../i18n/scoped-lexicon";
import {
  officialDomainLexiconRegistry,
  replaceOfficialDomainLexiconRegistryForHost,
  UNIT_LEXICON_ENTRIES,
} from "../../i18n/unit-lexicon";

function officialEntry(id: string, label: string): DomainLexiconEntry {
  return {
    id,
    domain: "unit",
    source: "catalog:official.domain-lexicon@2026.07.15",
    version: "2026.07.15",
    labels: {
      default: label,
      locales: { "zh-CN": `${label}-中文`, "en-US": label },
    },
    aliases: {
      default: [`${label}-alias`],
      locales: {
        "zh-CN": [`${label}-中文别名`],
        "en-US": [`${label}-alias`],
      },
    },
  };
}

afterEach(() => {
  replaceOfficialDomainLexiconRegistryForHost(
    new DomainLexiconRegistry(UNIT_LEXICON_ENTRIES),
  );
});

describe("active official Domain Lexicon facade", () => {
  it("preserves object identity while existing official and scoped readers observe a replacement", () => {
    const stableReference = officialDomainLexiconRegistry;
    const scoped = new ScopedDomainLexiconRegistry(stableReference);
    scoped.register("plugin-alpha", [
      {
        id: "private-unit",
        domain: "unit",
        version: "1",
        labels: { default: "private unit" },
        aliases: { default: ["private-alias"] },
      },
    ]);

    const catalogId = "unit.length.catalog-meter";
    replaceOfficialDomainLexiconRegistryForHost(
      new DomainLexiconRegistry([officialEntry(catalogId, "catalog meter")]),
    );

    expect(officialDomainLexiconRegistry).toBe(stableReference);
    expect(stableReference.resolve(catalogId, "en-US")?.label).toBe(
      "catalog meter",
    );
    expect(
      scoped.resolve("plugin-alpha", catalogId, { locale: "zh-CN" })?.label,
    ).toBe("catalog meter-中文");
    expect(
      scoped.resolve("plugin-alpha", "private-unit", { locale: "en-US" })?.entry
        .id,
    ).toBe("plugin:plugin-alpha:private-unit");
    expect(scoped.resolve("plugin-beta", "private-unit")).toBeNull();
    expect(() =>
      scoped.register("plugin-alpha", [
        {
          id: catalogId,
          domain: "unit",
          version: "1",
          labels: { default: "collision" },
          aliases: { default: ["collision"] },
        },
      ]),
    ).toThrow(/official/i);
  });

  it("keeps the previous snapshot when candidate construction fails", () => {
    const current = new DomainLexiconRegistry([
      officialEntry("unit.length.current-meter", "current meter"),
    ]);
    replaceOfficialDomainLexiconRegistryForHost(current);

    expect(
      () =>
        new DomainLexiconRegistry([
          officialEntry("unit.length.duplicate", "first"),
          officialEntry("unit.length.duplicate", "second"),
        ]),
    ).toThrow(/duplicate/i);

    expect(
      officialDomainLexiconRegistry.resolve(
        "unit.length.current-meter",
        "en-US",
      )?.label,
    ).toBe("current meter");
  });

  it("rejects self-referential publication instead of recursing", () => {
    expect(() =>
      replaceOfficialDomainLexiconRegistryForHost(
        officialDomainLexiconRegistry,
      ),
    ).toThrow(/facade/i);
  });
});
