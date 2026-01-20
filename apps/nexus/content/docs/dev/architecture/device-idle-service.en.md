# DeviceIdleService and Background Scan Scheduling

## Background
Background scans (app backfill, full sync, index updates) should respect user idle time and power conditions.
Idle and battery logic is currently scattered; we are consolidating it into a global service.

## Technical Implementation
- **Unified signals**
  - `powerMonitor.getSystemIdleTime()` for system idle duration.
  - `powerMonitor.isOnBatteryPower()` plus battery level queries (reusing existing broadcast logic).
  - Activity tracking and task scheduling (aligned with `BackgroundTaskService`).
- **Unified decision API**
  - Outputs `isIdle / idleMs / batteryLevel / charging` and `nextEligibleAt`.
  - Provides per-task `canRun` decisions with reason codes.
- **Task integration**
  - App indexing backfill and periodic full sync use DeviceIdleService windows.
  - File Index and other scans can migrate to the same decision path.
- **Fallbacks**
  - If idle/battery signals are unavailable, fall back to time-based scheduling (low priority).

## Configuration
Planned settings (user-configurable):
- `idleThresholdMs`
- `minBatteryPercent`
- `allowWhenCharging`
- `forceAfterHours`
