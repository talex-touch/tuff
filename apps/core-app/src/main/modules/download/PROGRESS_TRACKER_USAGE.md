# ProgressTracker Usage Guide

## Overview

The `ProgressTracker` class provides real-time download progress tracking with the following features:

- **Real-time speed calculation** using moving average algorithm
- **Remaining time estimation** based on current download speed
- **Throttled progress updates** to optimize performance
- **Formatted display** for sizes, speeds, and time

## Basic Usage

### Creating a ProgressTracker

```typescript
import { ProgressTracker } from './progress-tracker'

const tracker = new ProgressTracker('task-id-123', {
  windowSize: 10, // Number of data points for moving average
  updateInterval: 1000, // Update callback every 1000ms (1 second)
  minSpeedSamples: 2 // Minimum samples needed to calculate speed
})
```

### Updating Progress

```typescript
// Update progress as download proceeds
tracker.updateProgress(downloadedBytes, totalBytes)

// Example: Downloaded 50MB of 100MB
tracker.updateProgress(52428800, 104857600)
```

### Getting Progress Information

```typescript
// Get raw progress data
const progress = tracker.getProgress()
console.log(progress)
// {
//   totalSize: 104857600,
//   downloadedSize: 52428800,
//   speed: 2097152,        // bytes/s
//   remainingTime: 25,     // seconds
//   percentage: 50
// }

// Get formatted progress data
const formatted = tracker.getFormattedProgress()
console.log(formatted)
// {
//   percentage: "50.0%",
//   speed: "2.0 MB/s",
//   downloaded: "50.0 MB",
//   total: "100.0 MB",
//   remainingTime: "25秒"
// }
```

### Setting Up Callbacks

```typescript
// Set a throttled callback that will be called at most once per updateInterval
tracker.setThrottledCallback((progress) => {
  console.log(`Progress: ${progress.percentage}%`)
  console.log(`Speed: ${ProgressTracker.formatSpeed(progress.speed)}`)
  console.log(`Remaining: ${ProgressTracker.formatTime(progress.remainingTime)}`)
})

// The callback will be automatically called when updateProgress is called
// and the throttle interval has passed
tracker.updateProgress(downloadedBytes, totalBytes)
```

### Force Update

```typescript
// Force an immediate update, bypassing the throttle
tracker.forceUpdate()
```

### Reset Progress

```typescript
// Reset all progress data (useful for retrying downloads)
tracker.reset()
```

## Static Utility Methods

The `ProgressTracker` class provides static methods for formatting that can be used independently:

### Format Speed

```typescript
ProgressTracker.formatSpeed(0) // "0 B/s"
ProgressTracker.formatSpeed(512) // "512.0 B/s"
ProgressTracker.formatSpeed(1024) // "1.0 KB/s"
ProgressTracker.formatSpeed(1024 * 1024) // "1.0 MB/s"
ProgressTracker.formatSpeed(1024 * 1024 * 1024) // "1.0 GB/s"
```

### Format Size

```typescript
ProgressTracker.formatSize(0) // "0 B"
ProgressTracker.formatSize(512) // "512.0 B"
ProgressTracker.formatSize(1024) // "1.0 KB"
ProgressTracker.formatSize(1024 * 1024) // "1.0 MB"
ProgressTracker.formatSize(1024 * 1024 * 1024) // "1.0 GB"
```

### Format Time

```typescript
ProgressTracker.formatTime(15) // "15秒"
ProgressTracker.formatTime(72) // "1分12秒"
ProgressTracker.formatTime(3660) // "1小时1分"
ProgressTracker.formatTime(undefined) // "--"
```

## Integration with DownloadWorker

The `ProgressTracker` is automatically integrated into the `DownloadWorker`:

```typescript
// In DownloadWorker.startTask()
const progressTracker = new ProgressTracker(task.id, {
  windowSize: 10,
  updateInterval: 1000,
  minSpeedSamples: 2
})

// Set callback to notify DownloadCenter
progressTracker.setThrottledCallback((progress) => {
  onProgress(task.id, progress)
})

// Progress is automatically updated during download
// The tracker handles throttling and speed calculation
```

## How It Works

### Moving Average Algorithm

The `ProgressTracker` uses a sliding window approach to calculate download speed:

1. Stores the last N data points (configurable via `windowSize`)
2. Calculates speed using the first and last data points in the window
3. This smooths out speed fluctuations and provides a more stable reading

### Throttling Mechanism

To avoid overwhelming the UI with updates:

1. Progress updates are tracked internally on every call to `updateProgress()`
2. The callback is only triggered if `updateInterval` milliseconds have passed since the last callback
3. Use `forceUpdate()` to bypass throttling when needed (e.g., on completion)

### Remaining Time Calculation

Remaining time is estimated using:

```
remainingTime = (totalSize - downloadedSize) / currentSpeed
```

The calculation returns `undefined` if:
- Speed is 0 or negative
- Total size is unknown
- Download is already complete

## Best Practices

1. **Choose appropriate window size**: Larger windows (10-20) provide smoother speed readings but are less responsive to changes
2. **Set reasonable update intervals**: 1000ms (1 second) is recommended for UI updates
3. **Use forceUpdate() sparingly**: Only when you need immediate feedback (e.g., download completion)
4. **Reset on retry**: Always call `reset()` before retrying a failed download
5. **Use static methods for one-off formatting**: No need to create a tracker instance just to format values

## Example: Complete Download Flow

```typescript
// Create tracker
const tracker = new ProgressTracker('download-123', {
  windowSize: 10,
  updateInterval: 1000,
  minSpeedSamples: 2
})

// Set up UI update callback
tracker.setThrottledCallback((progress) => {
  updateUI({
    percentage: progress.percentage,
    speed: ProgressTracker.formatSpeed(progress.speed),
    downloaded: ProgressTracker.formatSize(progress.downloadedSize),
    total: ProgressTracker.formatSize(progress.totalSize || 0),
    remaining: ProgressTracker.formatTime(progress.remainingTime)
  })
})

// Simulate download progress
let downloaded = 0
const total = 100 * 1024 * 1024 // 100 MB

const interval = setInterval(() => {
  downloaded += 1024 * 1024 // Download 1 MB per interval

  tracker.updateProgress(downloaded, total)

  if (downloaded >= total) {
    clearInterval(interval)
    tracker.forceUpdate() // Force final update
    console.log('Download complete!')
  }
}, 100)
```

## Performance Considerations

- **Memory**: The tracker stores up to `windowSize` data points (typically 10-20), which is negligible
- **CPU**: Speed calculation is O(1) as it only uses first and last data points
- **Updates**: Throttling ensures callbacks are not called more than once per `updateInterval`
- **Garbage Collection**: Old data points are automatically removed when the window is full
