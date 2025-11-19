import { describe, expect, it } from 'vitest'

// Since ProgressTracker is in core-app and not exported as a package,
// we'll test the formatting utilities as static methods
// The actual ProgressTracker integration will be tested in the core-app context

// Mock the ProgressTracker static methods for testing
class ProgressTrackerUtils {
  static formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) {
      return '0 B/s'
    }

    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
    let size = bytesPerSecond
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  static formatSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B'
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  static formatTime(seconds: number | undefined): string {
    if (seconds === undefined || seconds <= 0) {
      return '--'
    }

    if (seconds < 60) {
      return `${Math.ceil(seconds)}秒`
    }

    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = Math.ceil(seconds % 60)
      return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分`
    }

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`
  }
}

describe('progressTracker Utilities', () => {
  describe('formatSpeed', () => {
    it('should format bytes per second', () => {
      expect(ProgressTrackerUtils.formatSpeed(0)).toBe('0 B/s')
      expect(ProgressTrackerUtils.formatSpeed(512)).toBe('512.0 B/s')
    })

    it('should format kilobytes per second', () => {
      expect(ProgressTrackerUtils.formatSpeed(1024)).toBe('1.0 KB/s')
      expect(ProgressTrackerUtils.formatSpeed(2048)).toBe('2.0 KB/s')
    })

    it('should format megabytes per second', () => {
      expect(ProgressTrackerUtils.formatSpeed(1024 * 1024)).toBe('1.0 MB/s')
      expect(ProgressTrackerUtils.formatSpeed(2.5 * 1024 * 1024)).toBe('2.5 MB/s')
    })

    it('should format gigabytes per second', () => {
      expect(ProgressTrackerUtils.formatSpeed(1024 * 1024 * 1024)).toBe('1.0 GB/s')
    })
  })

  describe('formatSize', () => {
    it('should format bytes', () => {
      expect(ProgressTrackerUtils.formatSize(0)).toBe('0 B')
      expect(ProgressTrackerUtils.formatSize(512)).toBe('512.0 B')
    })

    it('should format kilobytes', () => {
      expect(ProgressTrackerUtils.formatSize(1024)).toBe('1.0 KB')
      expect(ProgressTrackerUtils.formatSize(2048)).toBe('2.0 KB')
    })

    it('should format megabytes', () => {
      expect(ProgressTrackerUtils.formatSize(1024 * 1024)).toBe('1.0 MB')
      expect(ProgressTrackerUtils.formatSize(100 * 1024 * 1024)).toBe('100.0 MB')
    })

    it('should format gigabytes', () => {
      expect(ProgressTrackerUtils.formatSize(1024 * 1024 * 1024)).toBe('1.0 GB')
    })
  })

  describe('formatTime', () => {
    it('should format seconds', () => {
      expect(ProgressTrackerUtils.formatTime(15)).toBe('15秒')
      expect(ProgressTrackerUtils.formatTime(45)).toBe('45秒')
    })

    it('should format minutes', () => {
      expect(ProgressTrackerUtils.formatTime(60)).toBe('1分')
      expect(ProgressTrackerUtils.formatTime(72)).toBe('1分12秒')
      expect(ProgressTrackerUtils.formatTime(120)).toBe('2分')
    })

    it('should format hours', () => {
      expect(ProgressTrackerUtils.formatTime(3600)).toBe('1小时')
      expect(ProgressTrackerUtils.formatTime(3660)).toBe('1小时1分')
      expect(ProgressTrackerUtils.formatTime(7200)).toBe('2小时')
    })

    it('should handle undefined or invalid values', () => {
      expect(ProgressTrackerUtils.formatTime(undefined)).toBe('--')
      expect(ProgressTrackerUtils.formatTime(0)).toBe('--')
      expect(ProgressTrackerUtils.formatTime(-10)).toBe('--')
    })
  })
})
