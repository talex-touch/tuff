import type { MemoryScope, MemoryScopeEffect, MemoryType } from './memory-scope'
import { useI18n } from 'vue-i18n'

/**
 * Display strings the memory list, detail, editor and page share.
 *
 * The effect markers are written as static `t('…')` calls rather than looked up from a key map,
 * so the translation coverage test can see them.
 */
export function useMemoryLabels() {
  const { t } = useI18n()

  function typeLabel(type: MemoryType): string {
    return t(`intelligence.memoryReview.types.${type}`)
  }

  function scopeLabel(scope: MemoryScope): string {
    return t(`intelligence.memoryReview.scopes.${scope}`)
  }

  /** The marker a scope that is not plainly in effect carries; empty for `effective`. */
  function effectLabel(effect: MemoryScopeEffect): string {
    if (effect === 'inactive') return t('intelligence.memoryReview.effect.inactive')
    if (effect === 'source-session-only') {
      return t('intelligence.memoryReview.effect.sourceSessionOnly')
    }
    return ''
  }

  function formatTimestamp(value?: number): string {
    if (!value) return t('intelligence.memoryReview.notAvailable')
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(value)
  }

  return { typeLabel, scopeLabel, effectLabel, formatTimestamp }
}
