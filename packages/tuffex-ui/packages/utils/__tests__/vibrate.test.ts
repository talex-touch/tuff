import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useVibrate,
  useAutoVibrate,
  stopVibrate,
  isVibrateSupported,
  createVibratePattern,
  VibrateManager,
  VIBRATE_PATTERNS,
  vibrate
} from '../vibrate'

// Mock navigator.vibrate
const mockVibrate = vi.fn()

describe('Vibrate Utils', () => {
  beforeEach(() => {
    // Mock window and navigator
    Object.defineProperty(global, 'window', {
      value: {
        navigator: {
          vibrate: mockVibrate
        }
      },
      writable: true
    })
    mockVibrate.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('useVibrate', () => {
    it('should call vibrate with correct pattern for light type', () => {
      useVibrate('light')
      expect(mockVibrate).toHaveBeenCalledWith([5])
    })

    it('should call vibrate with correct pattern for heavy type', () => {
      useVibrate('heavy')
      expect(mockVibrate).toHaveBeenCalledWith([5, 30])
    })

    it('should call vibrate with correct pattern for success type', () => {
      useVibrate('success')
      expect(mockVibrate).toHaveBeenCalledWith([10, 50, 10])
    })

    it('should not vibrate when disabled', () => {
      useVibrate('light', { enabled: false })
      expect(mockVibrate).not.toHaveBeenCalled()
    })

    it('should use custom pattern when provided', () => {
      const customPattern = [100, 50, 100]
      useVibrate('light', { pattern: customPattern })
      expect(mockVibrate).toHaveBeenCalledWith(customPattern)
    })
  })

  describe('useAutoVibrate', () => {
    it('should call navigator.vibrate with correct duration', () => {
      const duration = [100, 50, 100]
      useAutoVibrate(duration)
      expect(mockVibrate).toHaveBeenCalledWith(duration)
    })

    it('should return true when vibration is successful', () => {
      mockVibrate.mockReturnValue(true)
      const result = useAutoVibrate([100])
      expect(result).toBe(true)
    })

    it('should return false when navigator.vibrate is not available', () => {
      // @ts-ignore
      delete window.navigator.vibrate
      const result = useAutoVibrate([100])
      expect(result).toBe(false)
    })

    it('should handle errors gracefully', () => {
      mockVibrate.mockImplementation(() => {
        throw new Error('Vibrate error')
      })
      const result = useAutoVibrate([100])
      expect(result).toBe(false)
    })
  })

  describe('stopVibrate', () => {
    it('should call navigator.vibrate with 0', () => {
      stopVibrate()
      expect(mockVibrate).toHaveBeenCalledWith(0)
    })

    it('should return true when successful', () => {
      mockVibrate.mockReturnValue(true)
      const result = stopVibrate()
      expect(result).toBe(true)
    })
  })

  describe('isVibrateSupported', () => {
    it('should return true when vibrate API is available', () => {
      expect(isVibrateSupported()).toBe(true)
    })

    it('should return false when vibrate API is not available', () => {
      // @ts-ignore
      delete window.navigator.vibrate
      expect(isVibrateSupported()).toBe(false)
    })

    it('should return false in non-browser environment', () => {
      // @ts-ignore
      delete global.window
      expect(isVibrateSupported()).toBe(false)
    })
  })

  describe('createVibratePattern', () => {
    it('should create pattern object with correct structure', () => {
      const pattern = [100, 50, 100]
      const description = 'Test pattern'
      const result = createVibratePattern(pattern, description)
      
      expect(result).toEqual({
        pattern,
        description
      })
    })

    it('should create pattern without description', () => {
      const pattern = [100, 50, 100]
      const result = createVibratePattern(pattern)
      
      expect(result).toEqual({
        pattern,
        description: undefined
      })
    })
  })

  describe('VibrateManager', () => {
    let manager: VibrateManager

    beforeEach(() => {
      manager = new VibrateManager()
    })

    it('should vibrate when enabled', () => {
      manager.vibrate('light')
      expect(mockVibrate).toHaveBeenCalledWith([5])
    })

    it('should not vibrate when disabled', () => {
      manager.setEnabled(false)
      manager.vibrate('light')
      expect(mockVibrate).not.toHaveBeenCalled()
    })

    it('should use custom pattern', () => {
      const customPattern = [200, 100, 200]
      manager.vibrate('light', customPattern)
      expect(mockVibrate).toHaveBeenCalledWith(customPattern)
    })

    it('should stop vibration', () => {
      manager.stop()
      expect(mockVibrate).toHaveBeenCalledWith(0)
    })

    it('should check support status', () => {
      expect(manager.isSupported()).toBe(true)
    })
  })

  describe('vibrate shortcuts', () => {
    it('should provide shortcut methods', () => {
      vibrate.light()
      expect(mockVibrate).toHaveBeenCalledWith([5])

      vibrate.heavy()
      expect(mockVibrate).toHaveBeenCalledWith([5, 30])

      vibrate.success()
      expect(mockVibrate).toHaveBeenCalledWith([10, 50, 10])
    })

    it('should provide stop method', () => {
      vibrate.stop()
      expect(mockVibrate).toHaveBeenCalledWith(0)
    })

    it('should provide isSupported method', () => {
      expect(vibrate.isSupported()).toBe(true)
    })
  })

  describe('VIBRATE_PATTERNS', () => {
    it('should contain all expected patterns', () => {
      expect(VIBRATE_PATTERNS).toHaveProperty('light')
      expect(VIBRATE_PATTERNS).toHaveProperty('heavy')
      expect(VIBRATE_PATTERNS).toHaveProperty('medium')
      expect(VIBRATE_PATTERNS).toHaveProperty('bit')
      expect(VIBRATE_PATTERNS).toHaveProperty('success')
      expect(VIBRATE_PATTERNS).toHaveProperty('warning')
      expect(VIBRATE_PATTERNS).toHaveProperty('error')
    })

    it('should have correct pattern structure', () => {
      Object.values(VIBRATE_PATTERNS).forEach(pattern => {
        expect(pattern).toHaveProperty('pattern')
        expect(Array.isArray(pattern.pattern)).toBe(true)
        expect(pattern.pattern.length).toBeGreaterThan(0)
      })
    })
  })
})
