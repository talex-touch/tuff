/**
 * I18n Helper Tests
 * Tests for main process internationalization
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { formatDuration, formatFileSize, formatRelativeTime, getLocale, setLocale, t } from '../i18n-helper'

describe('i18n Helper', () => {
  beforeEach(() => {
    // Reset to Chinese for each test
    setLocale('zh-CN')
  })

  describe('translation', () => {
    it('should translate Chinese keys correctly', () => {
      setLocale('zh-CN')
      expect(t('downloadErrors.network_error')).toBe('网络连接失败，请检查网络设置后重试')
      expect(t('downloadErrors.timeout_error')).toBe('下载超时，请检查网络连接后重试')
    })

    it('should translate English keys correctly', () => {
      setLocale('en-US')
      expect(t('downloadErrors.network_error')).toBe('Network connection failed, please check your network settings and try again')
      expect(t('downloadErrors.timeout_error')).toBe('Download timeout, please check your network connection and try again')
    })

    it('should handle parameter interpolation', () => {
      setLocale('zh-CN')
      const result = t('notifications.downloadCompleteBody', {
        filename: 'test.zip',
        size: '10MB',
        duration: '2分钟',
      })
      expect(result).toContain('test.zip')
      expect(result).toContain('10MB')
      expect(result).toContain('2分钟')
    })

    it('should return key for missing translations', () => {
      const result = t('nonexistent.key')
      expect(result).toBe('nonexistent.key')
    })

    it('should handle nested keys', () => {
      setLocale('zh-CN')
      expect(t('timeUnits.seconds')).toBe('秒')
      expect(t('timeUnits.minutes')).toBe('分钟')
    })
  })

  describe('locale Management', () => {
    it('should get and set locale', () => {
      setLocale('en-US')
      expect(getLocale()).toBe('en-US')

      setLocale('zh-CN')
      expect(getLocale()).toBe('zh-CN')
    })

    it('should switch translations when locale changes', () => {
      setLocale('zh-CN')
      expect(t('downloadErrors.cancelled')).toBe('下载已取消')

      setLocale('en-US')
      expect(t('downloadErrors.cancelled')).toBe('Download cancelled')
    })
  })

  describe('format Helpers', () => {
    describe('formatDuration', () => {
      beforeEach(() => {
        setLocale('zh-CN')
      })

      it('should format seconds', () => {
        const result = formatDuration(30)
        expect(result).toContain('30')
        expect(result).toContain('秒')
      })

      it('should format minutes and seconds', () => {
        const result = formatDuration(125) // 2 minutes 5 seconds
        expect(result).toContain('2')
        expect(result).toContain('分钟')
        expect(result).toContain('5')
        expect(result).toContain('秒')
      })

      it('should format hours and minutes', () => {
        const result = formatDuration(3665) // 1 hour 1 minute 5 seconds
        expect(result).toContain('1')
        expect(result).toContain('小时')
      })

      it('should format in English', () => {
        setLocale('en-US')
        const result = formatDuration(30)
        expect(result).toContain('30')
        expect(result).toContain('s')
      })
    })

    describe('formatFileSize', () => {
      it('should format bytes', () => {
        expect(formatFileSize(0)).toBe('0 B')
        expect(formatFileSize(500)).toBe('500.0 B')
      })

      it('should format kilobytes', () => {
        expect(formatFileSize(1024)).toBe('1.0 KB')
        expect(formatFileSize(2048)).toBe('2.0 KB')
      })

      it('should format megabytes', () => {
        expect(formatFileSize(1048576)).toBe('1.0 MB')
        expect(formatFileSize(10485760)).toBe('10.0 MB')
      })

      it('should format gigabytes', () => {
        expect(formatFileSize(1073741824)).toBe('1.0 GB')
      })
    })

    describe('formatRelativeTime', () => {
      beforeEach(() => {
        setLocale('zh-CN')
      })

      it('should format just now', () => {
        const now = new Date()
        const result = formatRelativeTime(now)
        expect(result).toBe('刚刚')
      })

      it('should format minutes ago', () => {
        const date = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
        const result = formatRelativeTime(date)
        expect(result).toContain('5')
        expect(result).toContain('分钟前')
      })

      it('should format hours ago', () => {
        const date = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
        const result = formatRelativeTime(date)
        expect(result).toContain('2')
        expect(result).toContain('小时前')
      })

      it('should format days ago', () => {
        const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
        const result = formatRelativeTime(date)
        expect(result).toContain('3')
        expect(result).toContain('天前')
      })

      it('should format in English', () => {
        setLocale('en-US')
        const date = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
        const result = formatRelativeTime(date)
        expect(result).toContain('5')
        expect(result).toContain('minutes ago')
      })
    })
  })

  describe('error Messages', () => {
    it('should provide all error message translations', () => {
      const errorTypes = [
        'network_error',
        'timeout_error',
        'disk_space_error',
        'permission_error',
        'checksum_error',
        'file_not_found',
        'invalid_url',
        'cancelled',
        'unknown_error',
      ]

      for (const errorType of errorTypes) {
        const zhMessage = t(`downloadErrors.${errorType}`)
        expect(zhMessage).not.toBe(`downloadErrors.${errorType}`)
        expect(zhMessage.length).toBeGreaterThan(0)

        setLocale('en-US')
        const enMessage = t(`downloadErrors.${errorType}`)
        expect(enMessage).not.toBe(`downloadErrors.${errorType}`)
        expect(enMessage.length).toBeGreaterThan(0)

        setLocale('zh-CN')
      }
    })
  })

  describe('notification Messages', () => {
    it('should provide all notification translations', () => {
      const notificationKeys = [
        'downloadComplete',
        'downloadCompleteBody',
        'downloadFailed',
        'downloadFailedBody',
        'updateAvailable',
        'updateAvailableBody',
        'updateReady',
        'updateReadyBody',
      ]

      for (const key of notificationKeys) {
        const zhMessage = t(`notifications.${key}`)
        expect(zhMessage).not.toBe(`notifications.${key}`)
        expect(zhMessage.length).toBeGreaterThan(0)

        setLocale('en-US')
        const enMessage = t(`notifications.${key}`)
        expect(enMessage).not.toBe(`notifications.${key}`)
        expect(enMessage.length).toBeGreaterThan(0)

        setLocale('zh-CN')
      }
    })
  })
})
