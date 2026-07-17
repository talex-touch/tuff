import type { FileScanOptions } from "./file-scan-constants";
import {
  BLACKLISTED_BUNDLE_SUFFIXES,
  BLACKLISTED_EXTENSIONS,
  BLACKLISTED_FILE_PREFIXES,
  BLACKLISTED_FILE_SUFFIXES,
  DATABASE_FILE_EXTENSIONS,
  DEFAULT_SCAN_OPTIONS,
  DEV_BLACKLISTED_DIRS,
  INTERNAL_DATABASE_FILE_EXTENSIONS,
  PATH_PATTERNS,
  PHOTOS_LIBRARY_CONFIG,
  SEARCH_HIDDEN_FILE_EXTENSIONS,
  SYSTEM_BLACKLISTED_DIRS,
  SYSTEM_METADATA_FILE_NAMES,
  SYSTEM_METADATA_FILE_PREFIXES,
  TEMP_BLACKLISTED_DIRS,
} from "./file-scan-constants";

export type FileFilterReason =
  | "hidden-name"
  | "temporary-name"
  | "system-metadata"
  | "internal-database"
  | "bundle-internal"
  | "system-path"
  | "development-path"
  | "cache-path"
  | "excluded-path"
  | "unsupported-extension";

export interface FileFilterTarget {
  path: string;
  name?: string;
  extension?: string | null;
  isDirectory?: boolean;
}

export interface FileSearchItemLike {
  meta?: {
    file?: {
      path: string;
      extension?: string;
      isDir?: boolean;
    };
  };
}

const LOWERCASE_BUNDLE_SUFFIXES = lowerCaseSet(BLACKLISTED_BUNDLE_SUFFIXES);
const LOWERCASE_DATABASE_EXTENSIONS = lowerCaseSet(DATABASE_FILE_EXTENSIONS);
const LOWERCASE_DEV_DIRS = lowerCaseSet(DEV_BLACKLISTED_DIRS);
const LOWERCASE_INTERNAL_DATABASE_EXTENSIONS = lowerCaseSet(
  INTERNAL_DATABASE_FILE_EXTENSIONS,
);
const LOWERCASE_SYSTEM_DIRS = lowerCaseSet(SYSTEM_BLACKLISTED_DIRS);
const LOWERCASE_TEMP_DIRS = lowerCaseSet(TEMP_BLACKLISTED_DIRS);
const LOWERCASE_SYSTEM_METADATA_NAMES = lowerCaseSet(
  SYSTEM_METADATA_FILE_NAMES,
);
const LOWERCASE_SEARCH_HIDDEN_EXTENSIONS = lowerCaseSet(
  SEARCH_HIDDEN_FILE_EXTENSIONS,
);

function lowerCaseSet(values: ReadonlySet<string>): ReadonlySet<string> {
  return new Set(Array.from(values, (value) => value.toLowerCase()));
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/");
}

function pathSegments(value: string): string[] {
  return normalizePath(value).split("/").filter(Boolean);
}

function basename(value: string): string {
  const normalized = normalizePath(value).replace(/\/+$/, "");
  const separator = normalized.lastIndexOf("/");
  return separator >= 0 ? normalized.slice(separator + 1) : normalized;
}

function normalizeExtension(
  extension: string | null | undefined,
  name: string,
): string {
  const candidate = extension?.trim();
  if (candidate) {
    const normalized = candidate.startsWith(".") ? candidate : `.${candidate}`;
    return normalized.toLowerCase();
  }

  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function resolveTargetName(target: FileFilterTarget): string {
  return basename(target.path) || target.name?.trim() || "";
}

function resolveTargetExtension(
  target: FileFilterTarget,
  name: string,
): string {
  return (
    normalizeExtension(undefined, name) ||
    normalizeExtension(target.extension, name)
  );
}

function hasHiddenSegment(segments: readonly string[]): boolean {
  return segments.some((segment) => segment.startsWith("."));
}

function hasBundleSegment(segments: readonly string[]): boolean {
  return segments.some((segment) => {
    const lower = segment.toLowerCase();
    for (const suffix of LOWERCASE_BUNDLE_SUFFIXES) {
      if (lower.endsWith(suffix)) return true;
    }
    return false;
  });
}

function matchesPattern(path: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

function hasConfiguredFilePrefix(name: string): boolean {
  return name.length > 0 && BLACKLISTED_FILE_PREFIXES.has(name.charAt(0));
}

function hasConfiguredFileSuffix(name: string): boolean {
  const lower = name.toLowerCase();
  for (const suffix of BLACKLISTED_FILE_SUFFIXES) {
    if (lower.endsWith(suffix.toLowerCase())) return true;
  }
  return false;
}

function isPhotosLibraryPathAllowed(path: string): boolean {
  const config = PHOTOS_LIBRARY_CONFIG;
  if (config.PATH_PATTERNS.BLOCKED.some((pattern) => path.includes(pattern)))
    return false;
  return config.PATH_PATTERNS.ALLOWED.some((pattern) => path.includes(pattern));
}

function optionEnabled(
  value: boolean | undefined,
  fallback: boolean | undefined,
): boolean {
  return value ?? fallback ?? false;
}

function getSearchExtensionReason(extension: string): FileFilterReason | null {
  if (!LOWERCASE_SEARCH_HIDDEN_EXTENSIONS.has(extension)) return null;
  if (extension === ".localized") return "system-metadata";
  if (LOWERCASE_INTERNAL_DATABASE_EXTENSIONS.has(extension))
    return "internal-database";
  return "temporary-name";
}

export class FileFilterService {
  getTraversalExclusionReason(
    directoryPath: string,
    options: FileScanOptions = DEFAULT_SCAN_OPTIONS,
  ): FileFilterReason | null {
    const path = directoryPath.trim();
    if (!path) return "excluded-path";
    if (options.customExcludePaths?.has(path)) return "excluded-path";

    const segments = pathSegments(path);
    const directoryName = segments.at(-1) ?? "";
    const lowerDirectoryName = directoryName.toLowerCase();

    if (directoryName.startsWith(".")) return "hidden-name";
    if (hasBundleSegment(segments)) return "bundle-internal";
    if (options.customBlacklistedDirs?.has(directoryName))
      return "excluded-path";
    if (LOWERCASE_DEV_DIRS.has(lowerDirectoryName)) return "development-path";
    if (LOWERCASE_SYSTEM_DIRS.has(lowerDirectoryName)) return "system-path";
    if (LOWERCASE_TEMP_DIRS.has(lowerDirectoryName)) return "cache-path";

    if (
      optionEnabled(
        options.enableSystemPathFilter,
        DEFAULT_SCAN_OPTIONS.enableSystemPathFilter,
      ) &&
      matchesPattern(path, PATH_PATTERNS.SYSTEM_PATHS)
    ) {
      return "system-path";
    }
    if (
      optionEnabled(
        options.enableDevPathFilter,
        DEFAULT_SCAN_OPTIONS.enableDevPathFilter,
      ) &&
      matchesPattern(path, PATH_PATTERNS.DEV_PATHS)
    ) {
      return "development-path";
    }
    if (
      optionEnabled(
        options.enableCachePathFilter,
        DEFAULT_SCAN_OPTIONS.enableCachePathFilter,
      ) &&
      matchesPattern(path, PATH_PATTERNS.CACHE_PATHS)
    ) {
      return "cache-path";
    }

    return null;
  }

  getIndexExclusionReason(
    target: FileFilterTarget,
    options: FileScanOptions = DEFAULT_SCAN_OPTIONS,
  ): FileFilterReason | null {
    const path = target.path.trim();
    if (!path) return "excluded-path";
    if (options.customExcludePaths?.has(path)) return "excluded-path";

    if (target.isDirectory)
      return this.getTraversalExclusionReason(path, options);

    const name = resolveTargetName(target);
    const lowerName = name.toLowerCase();
    if (LOWERCASE_SYSTEM_METADATA_NAMES.has(lowerName))
      return "system-metadata";
    if (
      SYSTEM_METADATA_FILE_PREFIXES.some((prefix) =>
        lowerName.startsWith(prefix),
      )
    ) {
      return "system-metadata";
    }

    const extension = resolveTargetExtension(target, name);
    if (!extension) return "unsupported-extension";

    if (
      BLACKLISTED_EXTENSIONS.has(extension) ||
      options.customBlacklistedExtensions?.has(extension)
    ) {
      return getSearchExtensionReason(extension) ?? "unsupported-extension";
    }
    if (hasConfiguredFilePrefix(name)) return "hidden-name";
    if (hasConfiguredFileSuffix(name)) return "temporary-name";

    if (
      optionEnabled(
        options.enablePhotosLibraryFilter,
        DEFAULT_SCAN_OPTIONS.enablePhotosLibraryFilter,
      ) &&
      path.includes("Photos Library.photoslibrary") &&
      !isPhotosLibraryPathAllowed(path)
    ) {
      return "bundle-internal";
    }

    const traversalReason = this.getContainingPathExclusionReason(
      path,
      options,
    );
    return traversalReason;
  }

  getManualIndexExclusionReason(
    target: FileFilterTarget,
  ): FileFilterReason | null {
    const searchReason = this.getSearchExclusionReason(target);
    if (searchReason) return searchReason;

    const name = resolveTargetName(target);
    const extension = resolveTargetExtension(target, name);
    return LOWERCASE_DATABASE_EXTENSIONS.has(extension)
      ? "internal-database"
      : null;
  }

  getSearchExclusionReason(target: FileFilterTarget): FileFilterReason | null {
    const path = target.path.trim();
    if (!path) return null;

    const segments = pathSegments(path);
    if (hasHiddenSegment(segments)) return "hidden-name";
    if (hasBundleSegment(segments)) return "bundle-internal";

    const name = resolveTargetName(target);
    const lowerName = name.toLowerCase();
    if (LOWERCASE_SYSTEM_METADATA_NAMES.has(lowerName))
      return "system-metadata";
    if (
      SYSTEM_METADATA_FILE_PREFIXES.some((prefix) =>
        lowerName.startsWith(prefix),
      )
    ) {
      return "system-metadata";
    }
    if (hasConfiguredFilePrefix(name)) return "hidden-name";
    if (hasConfiguredFileSuffix(name)) return "temporary-name";

    const extension = resolveTargetExtension(target, name);
    const extensionReason = getSearchExtensionReason(extension);
    if (extensionReason) return extensionReason;

    return null;
  }

  getSearchItemExclusionReason(
    item: FileSearchItemLike,
  ): FileFilterReason | null {
    const file = item.meta?.file;
    if (!file?.path) return null;
    return this.getSearchExclusionReason({
      path: file.path,
      extension: file.extension,
      isDirectory: file.isDir,
    });
  }

  filterSearchItems<T extends FileSearchItemLike>(items: T[]): T[] {
    let accepted: T[] | null = null;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || this.getSearchItemExclusionReason(item)) {
        if (!accepted) accepted = items.slice(0, index);
        continue;
      }
      accepted?.push(item);
    }

    return accepted ?? items;
  }

  private getContainingPathExclusionReason(
    filePath: string,
    options: FileScanOptions,
  ): FileFilterReason | null {
    const separator = Math.max(
      filePath.lastIndexOf("/"),
      filePath.lastIndexOf("\\"),
    );
    if (separator < 0) return null;

    return this.getTraversalExclusionReason(
      filePath.slice(0, separator),
      options,
    );
  }
}

export const fileFilterService = new FileFilterService();
