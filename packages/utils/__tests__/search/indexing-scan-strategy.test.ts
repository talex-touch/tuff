import { describe, expect, it } from "vitest";
import { resolveIndexedScanStrategy } from "../../search";

describe("indexing scan strategy", () => {
  it("splits watch paths into new full-scan paths and reconciliation paths", () => {
    expect(
      resolveIndexedScanStrategy({
        watchPaths: ["/Users/me/Documents", "/Users/me/Downloads"],
        completedScanPaths: new Set(["/Users/me/Documents"]),
      }),
    ).toEqual({
      newPathsToScan: ["/Users/me/Downloads"],
      reconciliationPaths: ["/Users/me/Documents"],
    });
  });

  it("treats all watch paths as new when no path has completed scan progress", () => {
    expect(
      resolveIndexedScanStrategy({
        watchPaths: ["/a", "/b"],
        completedScanPaths: new Set(),
      }),
    ).toEqual({
      newPathsToScan: ["/a", "/b"],
      reconciliationPaths: [],
    });
  });

  it("keeps input watch path order", () => {
    expect(
      resolveIndexedScanStrategy({
        watchPaths: ["/b", "/a", "/c"],
        completedScanPaths: new Set(["/a", "/c"]),
      }),
    ).toEqual({
      newPathsToScan: ["/b"],
      reconciliationPaths: ["/a", "/c"],
    });
  });

  it("matches completed scan paths through an optional normalizer", () => {
    expect(
      resolveIndexedScanStrategy({
        watchPaths: ["/Users/me/Documents", "/Users/me/Downloads"],
        completedScanPaths: new Set(["/users/me/documents"]),
        normalizePath: (value) => value.toLowerCase(),
      }),
    ).toEqual({
      newPathsToScan: ["/Users/me/Downloads"],
      reconciliationPaths: ["/Users/me/Documents"],
    });
  });

  it("deduplicates watch paths through the optional normalizer", () => {
    expect(
      resolveIndexedScanStrategy({
        watchPaths: [
          "/Users/me/Documents",
          "/users/me/documents",
          "/Users/me/Downloads",
        ],
        completedScanPaths: new Set(["/users/me/documents"]),
        normalizePath: (value) => value.toLowerCase(),
      }),
    ).toEqual({
      newPathsToScan: ["/Users/me/Downloads"],
      reconciliationPaths: ["/Users/me/Documents"],
    });
  });

  it("ignores empty normalized watch and completed paths", () => {
    expect(
      resolveIndexedScanStrategy({
        watchPaths: ["/Users/me/Documents", "   ", "/Users/me/Downloads"],
        completedScanPaths: new Set(["/users/me/documents", "   "]),
        normalizePath: (value) => value.trim().toLowerCase(),
      }),
    ).toEqual({
      newPathsToScan: ["/Users/me/Downloads"],
      reconciliationPaths: ["/Users/me/Documents"],
    });
  });
});
