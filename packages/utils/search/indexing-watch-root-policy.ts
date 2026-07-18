export type IndexedWatchPathNormalizer = (rawPath: string) => string;

export interface IndexedWatchRootSet {
  paths: string[];
  normalizedPaths: string[];
}

export interface ResolveIndexedWatchRootSetInput {
  basePaths: string[];
  extraPaths?: string[];
  normalizePath: IndexedWatchPathNormalizer;
}

export interface IndexedWatchPathOwnershipInput {
  rawPath: string;
  normalizedWatchPaths: string[];
  normalizePath: IndexedWatchPathNormalizer;
  pathSeparator?: string;
}

export interface FilterIndexedWatchPendingPermissionPathsInput {
  pendingPaths: string[];
  normalizedWatchPaths: string[];
  normalizePath: IndexedWatchPathNormalizer;
}

export interface IndexedWatchPathBasenameMatchInput {
  rawPath: string;
  basename: string | readonly string[];
  caseSensitive?: boolean;
}

export function resolveIndexedWatchRootSet(
  input: ResolveIndexedWatchRootSetInput,
): IndexedWatchRootSet {
  const paths: string[] = [];
  const normalizedPaths: string[] = [];
  const seen = new Set<string>();

  for (const candidate of [...input.basePaths, ...(input.extraPaths ?? [])]) {
    if (!candidate) continue;
    const normalized = input.normalizePath(candidate);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    paths.push(candidate);
    normalizedPaths.push(normalized);
  }

  return { paths, normalizedPaths };
}

export function isIndexedWatchPathOwned(
  input: IndexedWatchPathOwnershipInput,
): boolean {
  if (!input.rawPath) return false;

  const normalizedPath = input.normalizePath(input.rawPath);
  if (!normalizedPath) return false;
  const separator =
    input.pathSeparator ?? inferIndexedWatchPathSeparator(normalizedPath);

  for (const watchRoot of input.normalizedWatchPaths) {
    if (!watchRoot) continue;
    if (normalizedPath === watchRoot) return true;
    const rootWithSeparator = watchRoot.endsWith(separator)
      ? watchRoot
      : `${watchRoot}${separator}`;
    if (normalizedPath.startsWith(rootWithSeparator)) {
      return true;
    }
  }

  return false;
}

export function filterIndexedWatchPendingPermissionPaths(
  input: FilterIndexedWatchPendingPermissionPathsInput,
): string[] {
  const normalizedWatchSet = new Set(
    input.normalizedWatchPaths.filter(Boolean),
  );
  return input.pendingPaths.filter((pendingPath) => {
    const normalized = input.normalizePath(pendingPath);
    return Boolean(normalized) && normalizedWatchSet.has(normalized);
  });
}

export function getIndexedWatchPathBasename(rawPath: string): string {
  if (!rawPath) return "";

  let endIndex = rawPath.length;
  while (endIndex > 0 && isIndexedWatchPathSeparator(rawPath[endIndex - 1])) {
    endIndex -= 1;
  }

  if (endIndex === 0) return "";

  const lastForwardSlash = rawPath.lastIndexOf("/", endIndex - 1);
  const lastBackSlash = rawPath.lastIndexOf("\\", endIndex - 1);
  const startIndex = Math.max(lastForwardSlash, lastBackSlash) + 1;

  return rawPath.slice(startIndex, endIndex);
}

export function isIndexedWatchPathBasename(
  input: IndexedWatchPathBasenameMatchInput,
): boolean {
  const actual = getIndexedWatchPathBasename(input.rawPath);
  if (!actual) return false;

  const candidates = Array.isArray(input.basename)
    ? input.basename
    : [input.basename];
  if (input.caseSensitive === false) {
    const normalizedActual = actual.toLowerCase();
    return candidates.some(
      (candidate) => candidate.toLowerCase() === normalizedActual,
    );
  }

  return candidates.some((candidate) => candidate === actual);
}

function inferIndexedWatchPathSeparator(normalizedPath: string): string {
  return normalizedPath.includes("\\") && !normalizedPath.includes("/")
    ? "\\"
    : "/";
}

function isIndexedWatchPathSeparator(char: string | undefined): boolean {
  return char === "/" || char === "\\";
}
