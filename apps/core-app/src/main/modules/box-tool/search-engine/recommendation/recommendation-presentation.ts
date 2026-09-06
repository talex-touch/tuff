import { i18nMsg } from '@talex-touch/utils/i18n'
import type { ScoredItem } from './recommendation-engine'

/**
 * The single home for how a recommendation reason is presented.
 *
 * Text, icon and colour variant used to live in three files — the text hardcoded in Chinese inside
 * `item-rebuilder`, the variant→colour map in `ItemSubtitle.vue`, and the badge classes in
 * `BoxGridItem.vue` — so adding a `recommendation.source` meant editing all three and the English
 * UI showed Chinese either way. Text is an `$i18n:` message the renderer resolves; the variant is
 * the only thing styling keys off.
 */

export type RecommendationBadgeVariant =
  | 'frequent'
  | 'intelligent'
  | 'recent'
  | 'trending'
  | 'plugin'
  | 'newly-installed'
  | 'newly-added'

export interface RecommendationBadgeSpec {
  text: string
  icon: string
  variant: RecommendationBadgeVariant
}

export const DEFAULT_RECOMMENDATION_BADGE: RecommendationBadgeSpec = {
  text: i18nMsg('coreBox.recommendation.badge.suggested'),
  icon: 'i-ri-lightbulb-line',
  variant: 'intelligent'
}

export const RECOMMENDATION_BADGES: Record<ScoredItem['source'], RecommendationBadgeSpec> = {
  frequent: {
    text: i18nMsg('coreBox.recommendation.badge.frequent'),
    icon: 'i-ri-fire-line',
    variant: 'frequent'
  },
  'time-based': {
    text: i18nMsg('coreBox.recommendation.badge.timeBased'),
    icon: 'i-ri-time-line',
    variant: 'intelligent'
  },
  recent: {
    text: i18nMsg('coreBox.recommendation.badge.recent'),
    icon: 'i-ri-history-line',
    variant: 'recent'
  },
  trending: {
    text: i18nMsg('coreBox.recommendation.badge.trending'),
    icon: 'i-ri-line-chart-line',
    variant: 'trending'
  },
  context: {
    text: i18nMsg('coreBox.recommendation.badge.context'),
    icon: 'i-ri-sparkling-line',
    variant: 'intelligent'
  },
  plugin: {
    text: i18nMsg('coreBox.recommendation.badge.plugin'),
    icon: 'i-ri-puzzle-line',
    variant: 'plugin'
  },
  'newly-installed': {
    text: i18nMsg('coreBox.recommendation.badge.newlyInstalled'),
    icon: 'i-ri-download-2-line',
    variant: 'newly-installed'
  },
  'newly-added': {
    text: i18nMsg('coreBox.recommendation.badge.newlyAdded'),
    icon: 'i-ri-file-add-line',
    variant: 'newly-added'
  },
  pinned: {
    text: i18nMsg('coreBox.recommendation.badge.pinned'),
    icon: 'i-ri-pushpin-line',
    variant: 'frequent'
  },
  'cold-start': DEFAULT_RECOMMENDATION_BADGE
}

/**
 * Which tier of the empty state a reason belongs to.
 *
 * The split is not "important vs unimportant" but "needs explaining vs not": the top grid shows
 * bare icons for things the user reaches for out of habit or pinned themselves, and the list below
 * carries a reason line ("常在此时打开", "插件") for everything the host is proposing rather than
 * replaying.
 */
export const HABITUAL_RECOMMENDATION_SOURCES: ReadonlySet<ScoredItem['source']> = new Set([
  'frequent',
  'pinned'
])
