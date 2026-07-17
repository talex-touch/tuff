import { describe, expect, it } from "vitest";
import { fileFilterService } from "../common/file-filter-service";
import { createScanOptions } from "../common/file-scan-utils";

const portableScanOptions = createScanOptions({
  enableSystemPathFilter: false,
  enableDevPathFilter: false,
  enableCachePathFilter: false,
  enablePhotosLibraryFilter: false,
});

describe("FileFilterService", () => {
  it("hides high-confidence application metadata from ordinary search", () => {
    expect(
      fileFilterService.getSearchExclusionReason({
        path: "/Users/demo/Music/Library.tvdb",
      }),
    ).toBe("internal-database");
    expect(
      fileFilterService.getSearchExclusionReason({
        path: "/Users/demo/Music/Genius.itdb",
      }),
    ).toBe("internal-database");
    expect(
      fileFilterService.getSearchExclusionReason({
        path: "/Users/demo/Music/Media.localized",
      }),
    ).not.toBeNull();
    expect(
      fileFilterService.getSearchExclusionReason({
        path: "C:\\Users\\demo\\Desktop\\desktop.ini",
      }),
    ).toBe("system-metadata");
  });

  it("hides bundle interiors without over-matching similar user names", () => {
    expect(
      fileFilterService.getSearchExclusionReason({
        path: "/Users/demo/Music/Music Library.musiclibrary/Genius.itdb",
      }),
    ).toBe("bundle-internal");
    expect(
      fileFilterService.getTraversalExclusionReason(
        "/Users/demo/Music/Automatically Add to Music.localized",
        portableScanOptions,
      ),
    ).toBe("bundle-internal");
    expect(
      fileFilterService.getSearchExclusionReason({
        path: "/Users/demo/Documents/musiclibrary-notes.txt",
      }),
    ).toBeNull();
    expect(
      fileFilterService.getSearchExclusionReason({
        path: "/Users/demo/Documents/My.app.backup/readme.txt",
      }),
    ).toBeNull();
  });

  it("keeps ordinary archives and screenshots visible and indexable", () => {
    for (const path of [
      "/Users/demo/Downloads/WeTypeInstaller_3000.zip",
      "/Users/demo/Pictures/PixPin_2026-07-14.png",
      "/Users/demo/Pictures/Screenshot 2026-07-13.jpg",
    ]) {
      expect(fileFilterService.getSearchExclusionReason({ path })).toBeNull();
      expect(
        fileFilterService.getIndexExclusionReason(
          { path },
          portableScanOptions,
        ),
      ).toBeNull();
    }
  });

  it("lets manual indexing bypass unsupported extensions but not hard metadata", () => {
    expect(
      fileFilterService.getManualIndexExclusionReason({
        path: "/Users/demo/Documents/README",
      }),
    ).toBeNull();
    expect(
      fileFilterService.getManualIndexExclusionReason({
        path: "/Users/demo/Downloads/Installer.dmg",
      }),
    ).toBeNull();
    expect(
      fileFilterService.getManualIndexExclusionReason({
        path: "/Users/demo/Music/Library.tvdb",
      }),
    ).toBe("internal-database");
    expect(
      fileFilterService.getManualIndexExclusionReason({
        path: "/Users/demo/Documents/cache.db",
      }),
    ).toBe("internal-database");
  });

  it("filters typed file items while preserving user and virtual results", () => {
    const visible = fileFilterService.filterSearchItems([
      {
        id: "internal",
        meta: { file: { path: "/Users/demo/Music/Genius.itdb" } },
      },
      {
        id: "screenshot",
        meta: { file: { path: "/Users/demo/Pictures/Screenshot.png" } },
      },
      {
        id: "virtual-shell-entry",
      },
    ]);

    expect(visible.map((item) => item.id)).toEqual([
      "screenshot",
      "virtual-shell-entry",
    ]);
  });
});
