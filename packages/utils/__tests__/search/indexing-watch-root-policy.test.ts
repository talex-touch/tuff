import { describe, expect, it } from "vitest";
import {
  filterIndexedWatchPendingPermissionPaths,
  getIndexedWatchPathBasename,
  isIndexedWatchPathBasename,
  isIndexedWatchPathOwned,
  resolveIndexedWatchRootSet,
} from "../../search";

const normalizeCaseInsensitive = (rawPath: string) => rawPath.toLowerCase();

describe("indexing watch root policy", () => {
  it("resolves base and extra roots with normalized de-duplication", () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ["/Users/demo/Documents", "/Users/demo/Downloads"],
      extraPaths: ["/users/demo/documents", "/Users/demo/Desktop"],
      normalizePath: normalizeCaseInsensitive,
    });

    expect(rootSet.paths).toEqual([
      "/Users/demo/Documents",
      "/Users/demo/Downloads",
      "/Users/demo/Desktop",
    ]);
    expect(rootSet.normalizedPaths).toEqual([
      "/users/demo/documents",
      "/users/demo/downloads",
      "/users/demo/desktop",
    ]);
  });

  it("ignores roots rejected by the watch path normalizer", () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ["/Users/demo/Documents", "/ignored"],
      extraPaths: ["/Users/demo/Desktop", "   "],
      normalizePath: (rawPath) =>
        rawPath.trim() === "/ignored" ? "" : rawPath.trim().toLowerCase(),
    });

    expect(rootSet.paths).toEqual([
      "/Users/demo/Documents",
      "/Users/demo/Desktop",
    ]);
    expect(rootSet.normalizedPaths).toEqual([
      "/users/demo/documents",
      "/users/demo/desktop",
    ]);
  });

  it("checks ownership for roots and child paths", () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ["/Users/demo/Documents"],
      normalizePath: normalizeCaseInsensitive,
    });

    expect(
      isIndexedWatchPathOwned({
        rawPath: "/users/demo/documents",
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: "/",
      }),
    ).toBe(true);
    expect(
      isIndexedWatchPathOwned({
        rawPath: "/Users/demo/Documents/report.md",
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: "/",
      }),
    ).toBe(true);
  });

  it("does not treat shared prefixes as owned roots", () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ["/Users/demo/Documents"],
      normalizePath: normalizeCaseInsensitive,
    });

    expect(
      isIndexedWatchPathOwned({
        rawPath: "/Users/demo/Documents-old/report.md",
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: "/",
      }),
    ).toBe(false);
  });

  it("does not treat empty normalized paths or roots as owned", () => {
    expect(
      isIndexedWatchPathOwned({
        rawPath: "/ignored",
        normalizedWatchPaths: ["", "/users/demo/documents"],
        normalizePath: (rawPath) =>
          rawPath === "/ignored" ? "" : rawPath.toLowerCase(),
        pathSeparator: "/",
      }),
    ).toBe(false);
  });

  it("filters pending permission paths by exact normalized roots", () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ["/Users/demo/Documents", "/Users/demo/Downloads"],
      normalizePath: normalizeCaseInsensitive,
    });

    expect(
      filterIndexedWatchPendingPermissionPaths({
        pendingPaths: [
          "/users/demo/documents",
          "/Users/demo/Documents/report.md",
          "/Applications",
        ],
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
      }),
    ).toEqual(["/users/demo/documents"]);
  });

  it("ignores empty normalized pending permission paths and roots", () => {
    expect(
      filterIndexedWatchPendingPermissionPaths({
        pendingPaths: ["/Users/demo/Documents", "/ignored", "   "],
        normalizedWatchPaths: ["", "/users/demo/documents"],
        normalizePath: (rawPath) =>
          rawPath.trim() === "/ignored" ? "" : rawPath.trim().toLowerCase(),
      }),
    ).toEqual(["/Users/demo/Documents"]);
  });

  it("supports windows path separators", () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ["C:\\Users\\demo\\Documents"],
      normalizePath: normalizeCaseInsensitive,
    });

    expect(
      isIndexedWatchPathOwned({
        rawPath: "c:\\users\\demo\\documents\\report.md",
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: "\\",
      }),
    ).toBe(true);
  });

  it("extracts watch path basenames across platform separators", () => {
    expect(getIndexedWatchPathBasename("/browser/Default/Bookmarks")).toBe(
      "Bookmarks",
    );
    expect(
      getIndexedWatchPathBasename("C:\\Users\\demo\\Default\\Bookmarks"),
    ).toBe("Bookmarks");
    expect(getIndexedWatchPathBasename("/browser/Default/Bookmarks/")).toBe(
      "Bookmarks",
    );
  });

  it("matches watch path basenames case-sensitively by default", () => {
    expect(
      isIndexedWatchPathBasename({
        rawPath: "/browser/Default/Bookmarks",
        basename: "Bookmarks",
      }),
    ).toBe(true);
    expect(
      isIndexedWatchPathBasename({
        rawPath: "/browser/Default/Preferences",
        basename: "Bookmarks",
      }),
    ).toBe(false);
    expect(
      isIndexedWatchPathBasename({
        rawPath: "/browser/Default/bookmarks",
        basename: "Bookmarks",
      }),
    ).toBe(false);
  });

  it("can match watch path basenames case-insensitively", () => {
    expect(
      isIndexedWatchPathBasename({
        rawPath: "/browser/Default/bookmarks",
        basename: "Bookmarks",
        caseSensitive: false,
      }),
    ).toBe(true);
  });
});
