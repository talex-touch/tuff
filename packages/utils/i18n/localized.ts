import type { AppLocale } from './locale'
import { getFallbackChain } from './locale'

export interface LocalizedText {
  default: string
  locales?: Partial<Record<AppLocale, string>>
}

export interface LocalizedList {
  default: string[]
  locales?: Partial<Record<AppLocale, string[]>>
}

export type LocalizedTextValue = string | LocalizedText
export type LocalizedListValue = string[] | LocalizedList

export function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { default?: unknown }).default === 'string'
  )
}

export function isLocalizedList(value: unknown): value is LocalizedList {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { default?: unknown }).default) &&
    (value as { default: unknown[] }).default.every(item => typeof item === 'string')
  )
}

export function resolveLocalizedText(value: LocalizedTextValue, locale: AppLocale): string {
  if (typeof value === 'string') return value

  for (const candidate of getFallbackChain(locale)) {
    const localized = value.locales?.[candidate]
    if (typeof localized === 'string' && localized.trim()) {
      return localized
    }
  }

  return value.default
}

export function resolveLocalizedList(value: LocalizedListValue, locale: AppLocale): string[] {
  if (Array.isArray(value)) return [...value]

  for (const candidate of getFallbackChain(locale)) {
    const localized = value.locales?.[candidate]
    if (Array.isArray(localized)) {
      return [...localized]
    }
  }

  return [...value.default]
}
