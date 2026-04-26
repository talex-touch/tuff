# Download Center Migration Guide

This guide explains the schema migration system for the unified download center.

## Overview

The migration system handles:
1. **Schema Upgrades**: applying database schema changes
2. **Progress Tracking**: exposing real-time migration progress
3. **Rollback Support**: rolling back to an earlier schema version when needed

Legacy download database/config import has been removed from the runtime path. `DownloadCenter` now treats the current database as the only local source of truth.

## Components

### MigrationRunner

Handles database schema migrations and upgrades.

```typescript
import { allMigrations, MigrationRunner } from './migrations'

const runner = new MigrationRunner(dbPath)

const version = await runner.getCurrentVersion()
await runner.runMigrations(allMigrations)
await runner.rollbackTo(targetVersion, allMigrations)
```

## Migration Process

### Phase 1: Migrating
- Detect pending schema versions
- Apply migrations sequentially
- Emit progress events

### Phase 2: Validating
- Verify required tables and indexes
- Confirm migration metadata is updated

### Phase 3: Complete
- Persist the final schema version
- Report completion state

## Automated Testing

```typescript
import { allMigrations, MigrationRunner } from './migrations'

describe('MigrationRunner', () => {
  it('applies pending schema migrations', async () => {
    const runner = new MigrationRunner(testDbPath)
    await runner.runMigrations(allMigrations)
    expect(await runner.getCurrentVersion()).toBeGreaterThan(0)
  })
})
```

## Best Practices

1. **Backup data** before running migrations
2. **Test migrations** against development data first
3. **Monitor progress** during upgrades
4. **Validate results** after completion
5. **Document schema changes** in migration descriptions
6. **Version migrations** sequentially
7. **Test rollback** procedures where supported
