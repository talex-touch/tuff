import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tuffSdkItems } from "../tuffSdkItems";
import { featureSearchItems } from "./featureIndex";

const docsRoot = new URL("../../../content/docs/", import.meta.url);
const repoRoot = new URL("../../../../../", import.meta.url);

const sdkDocumentationRoutes = [
  { id: "indexed-source-sdk", path: "/docs/dev/api/search" },
  { id: "boxitem-sdk", path: "/docs/dev/api/feature" },
  { id: "features-sdk", path: "/docs/dev/api/feature" },
  { id: "plugin-sdk", path: "/docs/dev/api/plugin-context" },
  { id: "tuff-transport-sdk", path: "/docs/dev/api/transport" },
  { id: "localization-sdk", path: "/docs/dev/api/i18n" },
  { id: "screenshot-sdk", path: "/docs/dev/api/screenshot" },
] as const;

const sdkOwnerOnlyFiles: Record<string, string> = {
  "notification-sdk": "packages/utils/plugin/sdk/notification.ts",
  "performance-sdk": "packages/utils/plugin/sdk/performance.ts",
  "system-sdk": "packages/utils/plugin/sdk/system.ts",
  "service-sdk": "packages/utils/plugin/sdk/service/index.ts",
  "window-sdk": "packages/utils/plugin/sdk/window/index.ts",
  "touch-sdk": "packages/utils/plugin/sdk/touch-sdk.ts",
  "app-sdk": "packages/utils/renderer/hooks/use-app-sdk.ts",
  "platform-sdk": "packages/utils/renderer/hooks/use-platform-sdk.ts",
  "store-sdk": "packages/utils/renderer/hooks/use-store-sdk.ts",
  "disposable-sdk": "packages/utils/transport/sdk/domains/disposable.ts",
  "analytics-sdk": "packages/utils/analytics/client.ts",
};

function docsContentSlug(routePath: string): string {
  return routePath.replace(/^\/docs\//, "");
}

function hasLocalizedDocs(routePath: string): boolean {
  const slug = docsContentSlug(routePath);
  return existsSync(new URL(`${slug}.zh.mdc`, docsRoot))
    && existsSync(new URL(`${slug}.en.mdc`, docsRoot));
}

describe("feature search index", () => {
  it.each(sdkDocumentationRoutes)(
    "lists $id exactly once at its API documentation route",
    ({ id, path }) => {
      const matchingItems = featureSearchItems.filter((item) => item.id === id);

      expect(matchingItems).toEqual([expect.objectContaining({ id, path })]);
    },
  );

  it("keeps every SDK card bound to localized docs or an explicit SDK owner", () => {
    expect(tuffSdkItems.length).toBeGreaterThan(0);

    const ownerOnlyIds: string[] = [];

    for (const item of tuffSdkItems) {
      const matchingItems = featureSearchItems.filter((searchItem) => searchItem.id === item.id);
      const ownerFile = sdkOwnerOnlyFiles[item.id];

      expect(matchingItems.length > 0 || Boolean(ownerFile), `${item.id} docs route or owner`).toBe(true);

      if (matchingItems.length > 0) {
        expect(matchingItems, `${item.id} search entries`).toHaveLength(1);
        const routePath = matchingItems[0]?.path;
        expect(routePath, `${item.id} docs route path`).toBeTruthy();
        expect(hasLocalizedDocs(routePath ?? ""), `${item.id} localized docs`).toBe(true);
        continue;
      }

      if (!ownerFile) {
        throw new Error(`${item.id} is missing a docs route or SDK owner file`);
      }
      ownerOnlyIds.push(item.id);
      expect(existsSync(new URL(ownerFile, repoRoot)), `${item.id} owner file`).toBe(true);
    }

    expect(ownerOnlyIds.sort()).toEqual(Object.keys(sdkOwnerOnlyFiles).sort());
  });
});
