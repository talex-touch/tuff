import type { ModelRef } from './model-display'
import { computed, type ComputedRef } from 'vue'
import {
  readFavoriteModels,
  toModelRef,
  writableConversationSettings
} from './conversation-settings'
import { sameModelRef } from './model-display'

export interface UseModelFavoritesReturn {
  /** Starred models in the order they were starred, deduplicated, invalid entries dropped. */
  favorites: ComputedRef<ModelRef[]>
  isFavorite: (ref: ModelRef) => boolean
  /** Stars or unstars; the change auto-saves through the settings store. */
  toggle: (ref: ModelRef) => void
}

/**
 * Starred rows of the home model menu, read straight from `appSetting.conversation.favoriteModels`
 * so every caller sees the same list. A favourite is kept even when its provider is currently
 * absent; the menu resolves the list against the loaded choices when it renders the ★ tab.
 */
export function useModelFavorites(): UseModelFavoritesReturn {
  const favorites = computed<ModelRef[]>(() => readFavoriteModels())

  function isFavorite(ref: ModelRef): boolean {
    return favorites.value.some((favorite) => sameModelRef(favorite, ref))
  }

  function toggle(ref: ModelRef): void {
    const current = favorites.value
    const next = isFavorite(ref)
      ? current.filter((favorite) => !sameModelRef(favorite, ref))
      : [...current, toModelRef(ref)]
    // Replacing the array, rather than splicing the stored one, also drops any malformed
    // entries the read side was already ignoring.
    writableConversationSettings().favoriteModels = next
  }

  return { favorites, isFavorite, toggle }
}
