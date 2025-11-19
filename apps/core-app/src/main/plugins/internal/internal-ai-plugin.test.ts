import { describe, it, expect } from 'vitest'
import { normalizePrompt } from './internal-ai-utils'

describe('Internal AI Plugin', () => {
  describe('normalizePrompt', () => {
    it('should return empty string for null/undefined', () => {
      expect(normalizePrompt(null)).toBe('')
      expect(normalizePrompt(undefined)).toBe('')
    })

    it('should trim string input', () => {
      expect(normalizePrompt('  hello  ')).toBe('hello')
      expect(normalizePrompt('world')).toBe('world')
    })

    it('should extract text from object', () => {
      expect(normalizePrompt({ text: '  test  ' })).toBe('test')
      expect(normalizePrompt({ text: 'query' })).toBe('query')
      expect(normalizePrompt({ other: 'data' })).toBe('')
    })
  })
})
