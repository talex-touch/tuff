export { ChunkManager } from './chunk-manager'

export { ConcurrencyAdjuster } from './concurrency-adjuster'
export { DatabaseService } from './database-service'

// Export main module
export { DownloadCenterModule, downloadCenterModule } from './download-center'
// Export other components
export { DownloadWorker } from './download-worker'

// Export migration utilities
export { MigrationManager } from './migration-manager'
export type {
  MigrationProgress,
  MigrationResult,
  OldDownloadRecord,
  OldUpdateConfig
} from './migration-manager'
export { allMigrations, MigrationRunner } from './migrations'
export type { Migration, MigrationStatus } from './migrations'

export { NetworkMonitor } from './network-monitor'
// Export notification service
export { defaultNotificationConfig, NotificationService } from './notification-service'
export type { NotificationConfig } from './notification-service'
export { PriorityCalculator } from './priority-calculator'
// Export utilities
export { ProgressTracker } from './progress-tracker'
export type { FormattedProgress } from './progress-tracker'
export { TaskQueue } from './task-queue'
