import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DownloadEvents } from '../transport/events'

const REPO_ROOT = resolve(__dirname, "../../..");
const SCAN_ROOTS = ["apps/core-app/src", "packages", "plugins"] as const;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue"]);
const IGNORED_PATH_PARTS = new Set([
  ".nuxt",
  "coverage",
  "dist",
  "docs",
  "node_modules",
]);

const RETAINED_RAW_EVENT_DEFINITION_MAX = 246;

const RAW_SEND_ALLOWLIST = new Set([
  "apps/core-app/src/main/modules/division-box/state-sync.ts:division-box:session-changed",
  "apps/core-app/src/main/modules/division-box/state-sync.ts:division-box:session-destroyed",
  "apps/core-app/src/main/modules/division-box/state-sync.ts:division-box:state-changed",
  "apps/core-app/src/main/modules/plugin/dev-server-monitor.ts:tuff:dev-server-disconnected",
  "apps/core-app/src/main/modules/plugin/dev-server-monitor.ts:tuff:dev-server-reconnected",
  "packages/unplugin-export-plugin/src/core/dev.ts:tuff:update",
  "packages/unplugin-export-plugin/src/index.ts:tuff:update",
  "packages/utils/account/account-sdk.ts:account:logout",
  "packages/utils/account/account-sdk.ts:account:open-billing",
  "packages/utils/account/account-sdk.ts:account:open-profile",
  "packages/utils/account/account-sdk.ts:account:open-settings",
  "packages/utils/account/account-sdk.ts:account:open-upgrade",
]);

const EVENT_DELIMITER_COLLISION_ALLOWLIST = new Set([
  'auth/nexus/upload:auth:nexus-upload|auth:nexus:upload',
  'beginner/shortcut/triggered:beginner:shortcut-triggered|beginner:shortcut:triggered',
  'core/box/ui/mode/exited:core-box:ui-mode-exited|core-box:ui:mode-exited',
  'core/box/ui/resume:core-box:ui-resume|core-box:ui:resume',
])

const LEGACY_ALIAS_TOMBSTONES_PATH = 'packages/utils/transport/events/legacy-alias-tombstones.ts'

interface EventDelimiterCollision {
  normalizedName: string
  variants: string[]
  locations: string[]
}

interface RawEventDefinition {
  relativePath: string;
  eventName: string | null;
}

interface RawSendViolation {
  relativePath: string;
  eventName: string;
}

interface TransportGovernanceMetrics {
  rawSendViolations: RawSendViolation[];
  retainedRawEventDefinitions: RawEventDefinition[];
  typedMigrationCandidates: RawEventDefinition[];
}

function hasSourceExtension(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(filePath.replace(/.*(\.[^.]+)$/, "$1"));
}

function isIgnoredPath(relativePath: string, includeTests = false): boolean {
  const parts = relativePath.split('/')
  if (parts.some(part => IGNORED_PATH_PARTS.has(part))) {
    return true
  }
  if (includeTests) {
    return false
  }
  return /\.test\.[cm]?[jt]sx?$/.test(relativePath)
    || /\.spec\.[cm]?[jt]sx?$/.test(relativePath)
    || parts.includes('__tests__')
}

function listSourceFiles(root: string, includeTests = false): string[] {
  const absoluteRoot = resolve(REPO_ROOT, root)
  const files: string[] = []

  function visit(currentPath: string): void {
    const currentRelativePath = relative(REPO_ROOT, currentPath).replaceAll('\\', '/')
    if (isIgnoredPath(currentRelativePath, includeTests)) {
      return
    }

    const stats = statSync(currentPath);
    if (stats.isDirectory()) {
      for (const child of readdirSync(currentPath)) {
        visit(resolve(currentPath, child));
      }
      return;
    }

    if (stats.isFile() && hasSourceExtension(currentPath)) {
      files.push(currentPath);
    }
  }

  visit(absoluteRoot);
  return files;
}

function collectRawEventDefinitions(relativePath: string, source: string): RawEventDefinition[] {
  const rawEventPattern = /defineRawEvent(?:<[\s\S]*?>)?\(\s*(?:['"`]([^'"`$]+)['"`])?/g
  const definitions: RawEventDefinition[] = []
  let match = rawEventPattern.exec(source)

  while (match !== null) {
    definitions.push({
      relativePath,
      eventName: match[1] ?? null,
    });
    match = rawEventPattern.exec(source);
  }

  return definitions;
}

function collectRawSendViolations(relativePath: string, source: string): RawSendViolation[] {
  const rawSendPattern = /\b(?:send|sendSync|invoke)\(\s*['"`]([^"$'`][^"$':`]*:[^"$'`]+)['"`]/g
  const violations: RawSendViolation[] = []
  let match = rawSendPattern.exec(source)

  while (match !== null) {
    violations.push({
      relativePath,
      eventName: match[1],
    });
    match = rawSendPattern.exec(source);
  }

  return violations;
}

function collectEventDelimiterCollisions(): EventDelimiterCollision[] {
  const variantsByNormalizedName = new Map<string, Map<string, Set<string>>>()
  const eventLiteralPattern = /['"`]([a-z][a-z0-9-]*(?::[a-z0-9-]+)+)['"`]/g

  for (const scanRoot of SCAN_ROOTS) {
    for (const absolutePath of listSourceFiles(scanRoot, true)) {
      const relativePath = relative(REPO_ROOT, absolutePath).replaceAll('\\', '/')
      if (relativePath === LEGACY_ALIAS_TOMBSTONES_PATH) {
        continue
      }
      const source = readFileSync(absolutePath, 'utf8')
      eventLiteralPattern.lastIndex = 0
      let match = eventLiteralPattern.exec(source)

      while (match !== null) {
        const eventName = match[1]
        const normalizedName = eventName.replace(/[:-]/g, '/')
        const variants = variantsByNormalizedName.get(normalizedName) ?? new Map<string, Set<string>>()
        const locations = variants.get(eventName) ?? new Set<string>()
        locations.add(relativePath)
        variants.set(eventName, locations)
        variantsByNormalizedName.set(normalizedName, variants)
        match = eventLiteralPattern.exec(source)
      }
    }
  }

  return [...variantsByNormalizedName.entries()]
    .filter(([, variants]) => variants.size > 1)
    .map(([normalizedName, variants]) => ({
      normalizedName,
      variants: [...variants.keys()].sort(),
      locations: [...variants.values()].flatMap(locations => [...locations]).sort(),
    }))
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName))
}

function collectTransportGovernanceMetrics(): TransportGovernanceMetrics {
  const metrics: TransportGovernanceMetrics = {
    rawSendViolations: [],
    retainedRawEventDefinitions: [],
    typedMigrationCandidates: [],
  };

  for (const scanRoot of SCAN_ROOTS) {
    for (const absolutePath of listSourceFiles(scanRoot)) {
      const relativePath = relative(REPO_ROOT, absolutePath).replaceAll(
        "\\",
        "/",
      );
      const source = readFileSync(absolutePath, "utf8");
      const rawEventDefinitions = collectRawEventDefinitions(
        relativePath,
        source,
      );

      metrics.retainedRawEventDefinitions.push(...rawEventDefinitions);
      metrics.typedMigrationCandidates.push(
        ...rawEventDefinitions.filter(
          (definition) => (definition.eventName?.split(":").length ?? 0) >= 3,
        ),
      );
      metrics.rawSendViolations.push(
        ...collectRawSendViolations(relativePath, source),
      );
    }
  }

  return metrics;
}

describe("transport event boundary", () => {
  const metrics = collectTransportGovernanceMetrics();

  it("keeps raw send violations on the retained baseline", () => {
    const unauthorizedRawSends = metrics.rawSendViolations
      .map((item) => `${item.relativePath}:${item.eventName}`)
      .filter((item) => !RAW_SEND_ALLOWLIST.has(item));

    expect({
      rawSendViolations: metrics.rawSendViolations.length,
      unauthorizedRawSends,
    }).toEqual({
      rawSendViolations: metrics.rawSendViolations.length,
      unauthorizedRawSends: [],
    });
  });

  it("reports retained raw definitions separately from raw sends", () => {
    expect({
      rawSendViolations: metrics.rawSendViolations.length,
      retainedRawEventDefinitions: metrics.retainedRawEventDefinitions.length,
      typedMigrationCandidates: metrics.typedMigrationCandidates.length,
    }).toEqual(
      expect.objectContaining({
        rawSendViolations: expect.any(Number),
        retainedRawEventDefinitions: expect.any(Number),
        typedMigrationCandidates: expect.any(Number),
      }),
    );

    expect(metrics.retainedRawEventDefinitions.length).toBeGreaterThan(0);
    expect(metrics.retainedRawEventDefinitions.length).toBeLessThanOrEqual(
      RETAINED_RAW_EVENT_DEFINITION_MAX,
    );
  });

  it("does not use defineRawEvent for event names that fit typed builder shape", () => {
    const violations = metrics.typedMigrationCandidates.map(
      (item) => `${item.relativePath}: ${item.eventName}`,
    );

    expect(violations).toEqual([]);
  });

  it('keeps event delimiter variants on the explicit retained-alias baseline', () => {
    const delimiterCollisions = collectEventDelimiterCollisions()
    const unauthorizedCollisions = delimiterCollisions
      .map(collision => ({
        key: `${collision.normalizedName}:${collision.variants.join('|')}`,
        locations: collision.locations,
      }))
      .filter(collision => !EVENT_DELIMITER_COLLISION_ALLOWLIST.has(collision.key))

    expect(unauthorizedCollisions).toEqual([])
  })

  it('keeps download migration push events in the typed event registry', () => {
    expect(DownloadEvents.migration.progress.toEventName()).toBe('download:migration:progress')
    expect(DownloadEvents.migration.result.toEventName()).toBe('download:migration:result')
  })
})
