import { describe, expect, it } from "vitest";
import { FILE_SCAN_MAX_DEPTH } from "../../common/file-scan-constants";
import {
  getIndexedWatchDepthForPath,
  normalizeIndexedWatchPath,
} from "../../search";

describe("indexing watch path policy", () => {
  it("normalizes path and respects case sensitivity flag", () => {
    const source = "/Users/Test/Projects/../App/File.TXT";
    const insensitive = normalizeIndexedWatchPath(source, true);
    const sensitive = normalizeIndexedWatchPath(source, false);

    expect(insensitive).toBe(sensitive.toLowerCase());
  });

  it("shares the 24-level full-scan limit for macOS file index roots", () => {
    expect(FILE_SCAN_MAX_DEPTH).toBe(24);

    for (const watchPath of [
      "/Users/test/Downloads",
      "/Applications",
      "/Users/test/Documents",
    ]) {
      expect(
        getIndexedWatchDepthForPath({ platform: "darwin", watchPath }),
      ).toBe(FILE_SCAN_MAX_DEPTH);
    }
  });

  it("uses platform defaults for non-macOS roots", () => {
    expect(
      getIndexedWatchDepthForPath({
        platform: "win32",
        watchPath: "C:\\Users\\test\\Documents",
      }),
    ).toBe(4);
    expect(
      getIndexedWatchDepthForPath({
        platform: "linux",
        watchPath: "/home/test/Documents",
      }),
    ).toBe(3);
  });
});
