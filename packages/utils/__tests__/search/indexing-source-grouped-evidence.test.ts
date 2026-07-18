import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedSourceGroupedEvidenceService } from "../../search";

const service = new IndexedSourceGroupedEvidenceService();

describe("IndexedSourceGroupedEvidenceService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds grouped source evidence from result counts", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    expect(
      service.build({
        sourceId: "app-provider",
        keys: ["start-menu", "registry", "steam"],
        labels: {
          "start-menu": "Start Menu",
          registry: "Registry",
          steam: "Steam",
        },
        results: [
          {
            sourceId: "start-menu",
            itemCount: 2,
            label: "Windows Start Menu",
            metadata: { sourceType: "shortcuts" },
          },
          {
            sourceId: "registry",
            itemCount: 0,
            error: "registry-denied",
          },
        ],
        metadata: {
          platform: "win32",
        },
        resultMetadata: {
          evidenceSource: "scanner",
        },
        emptyReason: (key) => `${key}-empty`,
      }),
    ).toEqual([
      {
        id: "app-provider:start-menu",
        label: "Start Menu",
        status: "ready",
        itemCount: 2,
        lastCheckedAt: 1700000000000,
        reason: undefined,
        metadata: {
          platform: "win32",
          evidenceSource: "scanner",
          sourceType: "shortcuts",
          sourceLabel: "Windows Start Menu",
        },
      },
      {
        id: "app-provider:registry",
        label: "Registry",
        status: "degraded",
        itemCount: 0,
        lastCheckedAt: 1700000000000,
        reason: "registry-denied",
        metadata: {
          platform: "win32",
          evidenceSource: "scanner",
        },
      },
      {
        id: "app-provider:steam",
        label: "Steam",
        status: "degraded",
        itemCount: 0,
        lastCheckedAt: 1700000000000,
        reason: "steam-empty",
        metadata: {
          platform: "win32",
          evidenceSource: "scanner",
        },
      },
    ]);
  });

  it("supports per-key overrides for synthetic evidence rows", () => {
    expect(
      service.build({
        sourceId: "app-provider",
        keys: ["manual"],
        labels: {
          manual: "Manual entries",
        },
        results: [],
        overrides: {
          manual: {
            itemCount: 0,
            status: "degraded",
            reason: "manual-not-scanned",
            metadata: {
              evidenceSource: "scanner",
            },
          },
        },
      }),
    ).toMatchObject([
      {
        id: "app-provider:manual",
        status: "degraded",
        itemCount: 0,
        reason: "manual-not-scanned",
        metadata: {
          evidenceSource: "scanner",
        },
      },
    ]);
  });

  it("normalizes malformed checkedAt and item counts", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    expect(
      service.build({
        sourceId: "app-provider",
        checkedAt: Number.POSITIVE_INFINITY,
        keys: ["registry", "manual"],
        labels: {
          registry: "Registry",
          manual: "Manual entries",
        },
        results: [
          {
            sourceId: "registry",
            itemCount: -2,
          },
        ],
        overrides: {
          manual: {
            itemCount: Number.NaN,
          },
        },
      }),
    ).toMatchObject([
      {
        id: "app-provider:registry",
        itemCount: 0,
        lastCheckedAt: 1700000000000,
      },
      {
        id: "app-provider:manual",
        itemCount: 0,
        lastCheckedAt: 1700000000000,
      },
    ]);
  });
});
