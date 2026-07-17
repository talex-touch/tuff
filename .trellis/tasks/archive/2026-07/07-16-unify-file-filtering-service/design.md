# Design: unified file filtering service

## Decision

Use one pure `FileFilterService` as the policy owner and enforce it at three boundaries:

1. **Early source filtering** — scanner/native provider rejects noise before `stat`, local limits, icon work, and object construction.
2. **Index commit gate** — file-index persistence rejects every excluded record regardless of caller.
3. **Search publication gate** — provider aggregation and non-provider outbound paths reject every excluded file item before counts, ranking, caching, or UI delivery.

Early calls optimize cost. Commit/publication gates own correctness. Repeated evaluation is intentional and idempotent; rule definitions remain single-source.

## Ownership and location

`packages/utils/common/file-filter-service.ts` owns the policy because it must run in Worker and main-process contexts. It must not import Electron, CoreApp database schema, search-engine modules, or loggers.

`packages/utils/common/file-scan-constants.ts` remains the source of platform/path sets. Duplicate CoreApp `BLACKLISTED_*` declarations are removed after callers migrate.

## Contract

```ts
export type FileFilterReason =
  | 'hidden-name'
  | 'temporary-name'
  | 'system-metadata'
  | 'internal-database'
  | 'bundle-internal'
  | 'system-path'
  | 'development-path'
  | 'cache-path'
  | 'excluded-path'
  | 'unsupported-extension'

export interface FileFilterTarget {
  path: string
  name?: string
  extension?: string | null
  isDirectory?: boolean
}

export class FileFilterService {
  getTraversalExclusionReason(path: string, options?: FileScanOptions): FileFilterReason | null
  getIndexExclusionReason(target: FileFilterTarget, options?: FileScanOptions): FileFilterReason | null
  getManualIndexExclusionReason(target: FileFilterTarget): FileFilterReason | null
  getSearchExclusionReason(target: FileFilterTarget): FileFilterReason | null
  getSearchItemExclusionReason(item: FileSearchItemLike): FileFilterReason | null
  filterSearchItems<T extends FileSearchItemLike>(items: T[]): T[]
}

export const fileFilterService: FileFilterService
```

Methods return an interned reason or `null`; hot scan loops do not allocate decision objects. Callers log only rejected entries when diagnostics require it.

## Rule matrix

| Rule | Traverse | Auto index | Search visibility |
|---|---:|---:|---:|
| hidden directory/path segment | reject | reject | reject |
| existing system/dev/cache paths | reject | reject | unchanged except hidden/system metadata |
| media/application bundle interior | reject | reject | reject |
| `.itdb`, `.tvdb` | n/a | reject | reject |
| `.localized` file or directory | reject directory | reject | reject |
| `.DS_Store`, `._*`, `Thumbs.db`, `desktop.ini`, `Icon\r` | n/a | reject | reject |
| existing temp/backup extensions | n/a | reject | reject when high-confidence metadata/temp |
| CoreApp extension whitelist | n/a | auto-index only | do not apply |
| `.zip`, `.png`, `.jpg`, `.jpeg`, `.webp` | allow | allow | allow |

Search visibility deliberately does not reuse the complete index blacklist: native search must retain valid installers, disk images, extensionless files, and directories unless a high-confidence noise rule applies.

Manual indexing may bypass unsupported-extension rules, but not system metadata or bundle-internal rules.

## Data flow

### File index

`scan/watch/manual -> early FileFilterService -> file-index commit gate -> files/FTS/embedding`

- `scanDirectoryInto` uses traversal and index rules.
- incremental `buildFileRecord` uses index rules plus CoreApp whitelist policy.
- the file-specific `upsertSearchIndexFiles` boundary filters again before worker persistence.
- reconciliation sees excluded disk entries as absent and removes stale rows through its existing diff/delete path.

### Native providers

`backend paths -> FileFilterService search rule -> local limit/stat/icon -> TuffSearchResult`

- Spotlight retains root containment as a separate scope invariant.
- Linux filters before its local result limit.
- Everything keeps independent all-disk scope; only high-confidence noise is removed. Bounded over-fetch prevents filtered entries from consuming the visible result limit.

### Search publication

`provider result -> gather publication gate -> filtered stats/count -> merge/rank/cache -> UI`

`semantic/recommendation/cache/enrichment -> outbound publication gate -> UI`

The publication adapter derives file identity from typed `item.meta.file`. Virtual Windows Shell entries without an absolute filesystem path are preserved.

## Compatibility

- No transport or renderer payload changes.
- No database migration; the file index is rebuildable and reconciliation removes stale rows.
- Existing user query type/extension filters remain in `FileProviderSearchResultService`.
- Existing root containment and provider routing remain unchanged.
- Search result mutation is allowed by the current mutable `TuffSearchResult.items` contract.

## Failure and diagnostics

Filtering is deterministic and cannot throw for malformed inputs. Missing/blank file paths are not classified as filesystem noise at the generic publication boundary, preventing accidental removal of virtual entries. Index callers with invalid paths keep their existing validation behavior.

Provider result counts and search trace totals are calculated after publication filtering. Rejected reasons are unit-testable; no personal file paths are added to routine logs.

## Rollback

Reverting the service integrations restores previous behavior. No irreversible data migration is introduced. Excluded index rows can be recreated by a normal rebuild if the policy is rolled back.
