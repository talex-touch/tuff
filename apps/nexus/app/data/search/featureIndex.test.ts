import { describe, expect, it } from "vitest";
import { featureSearchItems } from "./featureIndex";

const sdkDocumentationRoutes = [
  { id: "indexed-source-sdk", path: "/docs/dev/api/search" },
  { id: "boxitem-sdk", path: "/docs/dev/api/feature" },
  { id: "features-sdk", path: "/docs/dev/api/feature" },
  { id: "plugin-sdk", path: "/docs/dev/api/plugin-context" },
  { id: "tuff-transport-sdk", path: "/docs/dev/api/transport" },
  { id: "localization-sdk", path: "/docs/dev/api/i18n" },
  { id: "screenshot-sdk", path: "/docs/dev/api/screenshot" },
] as const;

describe("feature search index", () => {
  it.each(sdkDocumentationRoutes)(
    "lists $id exactly once at its API documentation route",
    ({ id, path }) => {
      const matchingItems = featureSearchItems.filter((item) => item.id === id);

      expect(matchingItems).toEqual([expect.objectContaining({ id, path })]);
    },
  );
});
