# Download Center Migration Guide

This guide explains the data migration and compatibility system for the unified download center.

## Overview

The migration system handles:
1. **Data Migration**: Migrating download tasks and history from old systems
2. **Schema Upgrades**: Applying database schema changes
3. **Configuration Migration**: Converting old configuration formats to new ones
4. **Progress Tracking**: Real-time migration progress updates

## Components

### MigrationManager

Handles migration from old download systems to the new unified system.

```typescript
import { MigrationManager } from './migration-manager'

const manager = new MigrationManager(dbPath)

// Check if migration is needed
const needed = await manager.needsMigration()

// Run migration
const result = await manager.migrate()

// Listen to progress
manager.on('progress', (progress) => {
  console.log(`${progress.phase}: ${progress.percentage}%`)
})
```

### MigrationRunner

Handles database schema migrations and upgrades.

```typescript
import { MigrationRunner, allMigrations } from './migrations'

const runner = new MigrationRunner(dbPath)

// Get current version
const version = await runner.getCurrentVersion()

// Run all pending migrations
await runner.runMigrations(allMigrations)

// Rollback to specific version
await runner.rollbackTo(targetVersion, allMigrations)
```

## Migration Process

### Phase 1: Scanning
- Checks for old database files
- Checks for old configuration files
- Verifies migration status

### Phase 2: Migrating
- Migrates download tasks from old database
- Migrates download history
- Converts configuration files

### Phase 3: Validating
- Verifies all required tables exist
- Checks data integrity
- Validates migration completeness

### Phase 4: Complete
- Marks migration as complete
- Cleans up temporary files
- Reports results

## Old Data Format

The migration system supports the following old formats:

### Old Database Schema
```sql
CREATE TABLE downloads (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  path TEXT,
  name TEXT,
  filename TEXT,
  status TEXT,
  size INTEGER,
  downloaded INTEGER,
  createdAt INTEGER,
  completedAt INTEGER,
  error TEXT
)
```

### Old Configuration
```json
{
  "autoCheck": true,
  "autoDownload": false,
  "checkFrequency": "startup",
  "ignoredVersions": []
}
```

## New Data Format

### New Database Schema
```sql
CREATE TABLE download_tasks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  destination TEXT NOT NULL,
  filename TEXT NOT NULL,
  priority INTEGER NOT NULL,
  module TEXT NOT NULL,
  status TEXT NOT NULL,
  total_size INTEGER,
  downloaded_size INTEGER DEFAULT 0,
  checksum TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  error TEXT
)
```

### New Configuration
```json
{
  "download": {
    "concurrency": {
      "maxConcurrent": 3,
      "autoAdjust": true,
      "networkAware": true,
      "priorityBased": true
    },
    "chunk": {
      "size": 1048576,
      "resume": true,
      "autoRetry": true,
      "maxRetries": 3
    },
    "storage": {
      "tempDir": "/path/to/temp",
      "historyRetention": 30,
      "autoCleanup": true
    },
    "network": {
      "timeout": 30000,
      "retryDelay": 5000,
      "maxRetries": 3
    }
  },
  "update": {
    "enabled": true,
    "autoCheck": true,
    "autoDownload": false,
    "checkFrequency": "startup",
    "ignoredVersions": [],
    "updateSource": {
      "type": "github"
    }
  }
}
```

## Schema Migrations

### Available Migrations

1. **v1: Performance Indexes** - Adds indexes for better query performance
2. **v2: Checksum Field** - Adds checksum field for file verification
3. **v3: Metadata Field** - Adds metadata field for additional information
4. **v4: Error Field** - Adds error field for error messages

### Creating New Migrations

```typescript
export const myNewMigration: Migration = {
  version: 5,
  name: 'my_new_migration',
  description: 'Description of what this migration does',
  up: async (db: any) => {
    // Apply changes
    await db.execute('ALTER TABLE download_tasks ADD COLUMN new_field TEXT')
  },
  down: async (db: any) => {
    // Rollback changes (optional)
    console.log('Rollback not implemented')
  }
}

// Add to allMigrations array
export const allMigrations: Migration[] = [
  addPerformanceIndexes,
  addChecksumField,
  addMetadataField,
  addErrorField,
  myNewMigration
]
```

## UI Integration

### Migration Progress Component

The `MigrationProgress.vue` component displays migration progress:

```vue
<template>
  <MigrationProgress />
</template>

<script setup>
import MigrationProgress from '@/components/download/MigrationProgress.vue'
</script>
```

### IPC Channels

#### Check Migration Status
```typescript
const needed = await window.electron.ipcRenderer.invoke('download:check-migration-needed')
```

#### Start Migration
```typescript
window.electron.ipcRenderer.send('download:start-migration')
```

#### Listen to Progress
```typescript
window.electron.ipcRenderer.on('download:migration-progress', (progress) => {
  console.log(progress)
})
```

#### Listen to Result
```typescript
window.electron.ipcRenderer.on('download:migration-result', (result) => {
  console.log(result)
})
```

## Error Handling

### Migration Errors

The migration system handles various error scenarios:

1. **Old Database Not Found**: Skips migration, continues normally
2. **Schema Mismatch**: Attempts to fix schema issues
3. **Data Corruption**: Logs errors, continues with valid data
4. **Disk Space**: Checks available space before migration
5. **Permission Errors**: Reports clear error messages

### Recovery

If migration fails:
1. Check the error message in the UI
2. Review logs in the error logger
3. Retry migration using the "Retry" button
4. Contact support if issues persist

## Testing

### Manual Testing

1. Create old database with test data
2. Run application
3. Verify migration dialog appears
4. Monitor progress
5. Verify data integrity after migration

### Automated Testing

```typescript
import { MigrationManager } from './migration-manager'

describe('MigrationManager', () => {
  it('should detect old data', async () => {
    const manager = new MigrationManager(testDbPath)
    const needed = await manager.needsMigration()
    expect(needed).toBe(true)
  })

  it('should migrate tasks', async () => {
    const manager = new MigrationManager(testDbPath)
    const result = await manager.migrate()
    expect(result.success).toBe(true)
    expect(result.migratedTasks).toBeGreaterThan(0)
  })
})
```

## Best Practices

1. **Always backup data** before migration
2. **Test migrations** on development data first
3. **Monitor progress** during migration
4. **Validate results** after migration
5. **Keep old data** for a period after successful migration
6. **Document changes** in migration descriptions
7. **Version migrations** sequentially
8. **Test rollback** procedures

## Troubleshooting

### Migration Stuck

If migration appears stuck:
1. Check system resources (CPU, disk)
2. Review error logs
3. Restart application
4. Try manual migration

### Data Missing After Migration

If data is missing:
1. Check migration result for errors
2. Verify old database still exists
3. Review migration logs
4. Retry migration

### Performance Issues

If migration is slow:
1. Check disk I/O
2. Reduce concurrent operations
3. Increase available memory
4. Consider batch processing

## Support

For migration issues:
1. Check error logs: `download:get-logs`
2. Review migration status: `download:get-migration-status`
3. Export diagnostics
4. Contact support with logs

## Future Enhancements

Planned improvements:
1. Incremental migration for large datasets
2. Background migration option
3. Migration preview/dry-run
4. Automatic backup before migration
5. Migration rollback support
6. Cross-version migration paths
