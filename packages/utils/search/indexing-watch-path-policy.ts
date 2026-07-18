import pathBrowserify from "path-browserify";
import { hasWindow } from "../env";

const path = (() => {
  if (hasWindow()) {
    return pathBrowserify;
  }

  const nodeRequire = typeof require === "function" ? require : null;
  if (nodeRequire) {
    try {
      return nodeRequire("node:path");
    } catch {
      return pathBrowserify;
    }
  }

  return pathBrowserify;
})();

export type IndexedWatchPathPlatform = "darwin" | "win32" | "linux";

export interface IndexedWatchDepthPolicyInput {
  watchPath: string;
  platform?: IndexedWatchPathPlatform;
}

export function normalizeIndexedWatchPath(
  rawPath: string,
  isCaseInsensitiveFs: boolean,
): string {
  const normalized = path.normalize(rawPath);
  return isCaseInsensitiveFs ? normalized.toLowerCase() : normalized;
}

export function getIndexedWatchDepthForPath(
  input: IndexedWatchDepthPolicyInput,
): number {
  const platform = input.platform ?? getCurrentPlatform();

  if (platform === "darwin") {
    return 5;
  }

  if (platform === "win32") {
    return 4;
  }

  return 3;
}

function getCurrentPlatform(): IndexedWatchPathPlatform {
  const platform = typeof process === "undefined" ? null : process.platform;
  return platform === "darwin" || platform === "win32" || platform === "linux"
    ? platform
    : "linux";
}
