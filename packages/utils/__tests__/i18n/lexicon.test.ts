import { describe, expect, it } from "vitest";
import {
  DomainLexiconRegistry,
  type DomainLexiconEntry,
} from "../../i18n/lexicon";

function entry(
  id: string,
  aliases: DomainLexiconEntry["aliases"],
): DomainLexiconEntry {
  return {
    id,
    domain: "unit",
    source: "builtin",
    version: "1",
    labels: {
      default: id,
      locales: {
        "zh-CN": `${id}-中文`,
        "en-US": `${id}-English`,
      },
    },
    aliases,
  };
}

describe("DomainLexiconRegistry", () => {
  it("rejects duplicate canonical IDs rather than silently shadowing an entry", () => {
    const duplicateId = "unit.length.m";

    expect(
      () =>
        new DomainLexiconRegistry([
          entry(duplicateId, { default: ["meter"] }),
          entry(duplicateId, { default: ["metre"] }),
        ]),
    ).toThrow(/duplicate/i);
  });

  it("isolates its canonical and localized views from later source mutation", () => {
    const source = {
      id: "unit.length.km",
      domain: "unit",
      source: "builtin",
      version: "1",
      labels: {
        default: "kilometer",
        locales: { "zh-CN": "千米", "en-US": "kilometer" },
      },
      aliases: {
        default: ["km"],
        locales: { "zh-CN": ["千米"], "en-US": ["kilometer"] },
      },
    } satisfies DomainLexiconEntry;
    const registry = new DomainLexiconRegistry([source]);

    source.labels.locales!["zh-CN"] = "已篡改";
    source.aliases.locales!["zh-CN"].push("已篡改别名");

    expect(registry.resolve("unit.length.km", "zh-CN")).toEqual(
      expect.objectContaining({
        label: "千米",
        aliases: ["km", "千米"],
      }),
    );
    expect(registry.matchAlias("已篡改别名", { locale: "zh-CN" })).toBeNull();
  });

  it("resolves canonical IDs with the requested localized label", () => {
    const registry = new DomainLexiconRegistry([
      entry("unit.length.km", {
        default: ["km"],
        locales: {
          "zh-CN": ["千米"],
          "en-US": ["kilometer"],
        },
      }),
    ]);

    expect(registry.resolve("unit.length.km", "zh-CN")).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({ id: "unit.length.km" }),
        label: "unit.length.km-中文",
      }),
    );
    expect(registry.resolve("unit.length.km", "en-US")).toEqual(
      expect.objectContaining({ label: "unit.length.km-English" }),
    );
  });

  it("matches aliases from every locale while resolving the caller locale", () => {
    const registry = new DomainLexiconRegistry([
      entry("unit.length.km", {
        default: ["km"],
        locales: {
          "zh-CN": ["千米", "公里"],
          "en-US": ["kilometer", "kilometers"],
        },
      }),
    ]);

    expect(registry.matchAlias("公里", { locale: "en-US" })).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({ id: "unit.length.km" }),
      }),
    );
    expect(registry.matchAlias("kilometers", { locale: "zh-CN" })).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({ id: "unit.length.km" }),
      }),
    );
  });

  it("ranks the current locale alias ahead of an equally exact cross-locale alias", () => {
    const registry = new DomainLexiconRegistry([
      entry("unit.demo.english", {
        default: ["fallback-english"],
        locales: { "en-US": ["needle"], "zh-CN": ["英语别名"] },
      }),
      entry("unit.demo.chinese", {
        default: ["fallback-chinese"],
        locales: { "en-US": ["英文别名"], "zh-CN": ["needle"] },
      }),
    ]);

    expect(
      registry
        .search("needle", { locale: "en-US" })
        .map((match) => match.entry.id),
    ).toEqual(["unit.demo.english", "unit.demo.chinese"]);
    expect(
      registry
        .search("needle", { locale: "zh-CN" })
        .map((match) => match.entry.id),
    ).toEqual(["unit.demo.chinese", "unit.demo.english"]);
  });

  it("uses canonical IDs as stable ordering for equal ranked search results", () => {
    const registry = new DomainLexiconRegistry([
      entry("unit.demo.beta", { default: ["shared"] }),
      entry("unit.demo.alpha", { default: ["shared"] }),
    ]);

    expect(
      registry
        .search("shared", { locale: "en-US" })
        .map((match) => match.entry.id),
    ).toEqual(["unit.demo.alpha", "unit.demo.beta"]);
  });
});
