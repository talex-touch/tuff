import { describe, expect, it } from "vitest";
import {
  type PluginDomainLexiconEntryInput,
  ScopedDomainLexiconRegistry,
  officialDomainLexiconRegistry,
} from "../../i18n";

function pluginEntry(id: string, label = id): PluginDomainLexiconEntryInput {
  return {
    id,
    domain: "capability",
    version: "1",
    labels: {
      default: label,
      locales: { "zh-CN": `${label}-中文` },
    },
    aliases: {
      default: [label],
      locales: { "zh-CN": [`${label}-别名`] },
    },
  };
}

function registry(): ScopedDomainLexiconRegistry {
  return new ScopedDomainLexiconRegistry(officialDomainLexiconRegistry);
}

describe("ScopedDomainLexiconRegistry", () => {
  it("keeps official entries readable with their host-owned provenance", () => {
    const scoped = registry();

    const resolved = scoped.resolve("plugin-a", "unit.length.meter", {
      locale: "zh-CN",
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        label: "米",
        entry: expect.objectContaining({
          id: "unit.length.meter",
          source: "builtin",
        }),
      }),
    );
  });

  it("namespaces plugin entries and overwrites their provenance", () => {
    const scoped = registry();
    scoped.register("plugin-a", [pluginEntry("report.summary", "Summary")]);

    const resolved = scoped.resolve(
      "plugin-a",
      "plugin:plugin-a:report.summary",
      {
        locale: "en-US",
      },
    );

    expect(resolved).toEqual(
      expect.objectContaining({
        label: "Summary",
        entry: expect.objectContaining({
          id: "plugin:plugin-a:report.summary",
          source: "plugin:plugin-a",
        }),
      }),
    );
    expect(scoped.getNamespace("plugin-a")).toBe("plugin:plugin-a:");
  });

  it("never exposes one plugin overlay to another plugin", () => {
    const scoped = registry();
    scoped.register("plugin-a", [
      pluginEntry("private.status", "Private Status"),
    ]);

    expect(
      scoped.resolve("plugin-b", "plugin:plugin-a:private.status"),
    ).toBeNull();
    expect(scoped.search("plugin-b", "Private Status")).toEqual([]);
    expect(
      scoped.resolve("plugin-a", "plugin:plugin-a:private.status"),
    ).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({ source: "plugin:plugin-a" }),
      }),
    );
  });

  it("upserts matching local IDs and replaces only the caller overlay when requested", () => {
    const scoped = registry();
    scoped.register("plugin-a", [
      pluginEntry("report.summary", "First summary"),
    ]);
    scoped.register("plugin-a", [
      pluginEntry("report.summary", "Updated summary"),
    ]);

    expect(
      scoped.resolve("plugin-a", "plugin:plugin-a:report.summary"),
    ).toEqual(expect.objectContaining({ label: "Updated summary" }));

    scoped.register("plugin-a", [pluginEntry("report.detail", "Detail")], {
      replace: true,
    });

    expect(
      scoped.resolve("plugin-a", "plugin:plugin-a:report.summary"),
    ).toBeNull();
    expect(scoped.resolve("plugin-a", "plugin:plugin-a:report.detail")).toEqual(
      expect.objectContaining({ label: "Detail" }),
    );
    expect(scoped.resolve("plugin-a", "unit.length.meter")).not.toBeNull();
  });

  it("preserves the previous overlay when any entry in a registration batch is invalid", () => {
    const scoped = registry();
    scoped.register("plugin-a", [pluginEntry("stable", "Original")]);

    expect(() =>
      scoped.register("plugin-a", [
        pluginEntry("stable", "Overwritten only if the batch commits"),
        pluginEntry("unit.length.meter", "Illegal official override"),
      ]),
    ).toThrow();

    expect(scoped.resolve("plugin-a", "plugin:plugin-a:stable")).toEqual(
      expect.objectContaining({ label: "Original" }),
    );
  });

  it("preserves the previous overlay when metadata is not JSON-serializable", () => {
    const scoped = registry();
    scoped.register("plugin-a", [pluginEntry("stable", "Original")]);
    const invalid = {
      ...pluginEntry("invalid-metadata", "Invalid metadata"),
      metadata: { formatter: () => "not serializable" },
    };

    expect(() => scoped.register("plugin-a", [invalid])).toThrow();
    expect(scoped.resolve("plugin-a", "plugin:plugin-a:stable")).toEqual(
      expect.objectContaining({ label: "Original" }),
    );
    expect(
      scoped.resolve("plugin-a", "plugin:plugin-a:invalid-metadata"),
    ).toBeNull();
  });

  it.each([
    ["blank local IDs", pluginEntry("   ")],
    ["official IDs", pluginEntry("unit.length.meter")],
    ["already-prefixed IDs", pluginEntry("plugin:other-plugin:private")],
  ])("rejects %s before they enter a plugin namespace", (_name, entry) => {
    const scoped = registry();

    expect(() => scoped.register("plugin-a", [entry])).toThrow();
  });

  it("enforces per-call and per-plugin entry bounds without adding rejected entries", () => {
    const scoped = registry();
    const entries = Array.from({ length: 101 }, (_value, index) =>
      pluginEntry(`entry-${index}`, `Entry ${index}`),
    );

    expect(() => scoped.register("plugin-a", entries.slice(0, 51))).toThrow();
    expect(scoped.resolve("plugin-a", "plugin:plugin-a:entry-0")).toBeNull();

    scoped.register("plugin-a", entries.slice(0, 50));
    scoped.register("plugin-a", entries.slice(50, 100));

    expect(() => scoped.register("plugin-a", [entries[100]!])).toThrow();
    expect(scoped.resolve("plugin-a", "plugin:plugin-a:entry-100")).toBeNull();
    expect(
      scoped.resolve("plugin-a", "plugin:plugin-a:entry-99"),
    ).not.toBeNull();
  });

  it("rejects oversized input before it mutates the overlay", () => {
    const scoped = registry();
    scoped.register("plugin-a", [pluginEntry("stable", "Original")]);
    const oversized = {
      ...pluginEntry("too-large"),
      metadata: { payload: "x".repeat(256 * 1024) },
    };

    expect(() => scoped.register("plugin-a", [oversized])).toThrow();
    expect(scoped.resolve("plugin-a", "plugin:plugin-a:stable")).toEqual(
      expect.objectContaining({ label: "Original" }),
    );
    expect(scoped.resolve("plugin-a", "plugin:plugin-a:too-large")).toBeNull();
  });

  it("clears only the requested plugin overlay while retaining official reads", () => {
    const scoped = registry();
    scoped.register("plugin-a", [pluginEntry("temporary", "Temporary")]);
    scoped.register("plugin-b", [pluginEntry("retained", "Retained")]);

    scoped.clear("plugin-a");

    expect(scoped.resolve("plugin-a", "plugin:plugin-a:temporary")).toBeNull();
    expect(
      scoped.resolve("plugin-b", "plugin:plugin-b:retained"),
    ).not.toBeNull();
    expect(scoped.resolve("plugin-a", "unit.length.meter")).not.toBeNull();
  });
});
