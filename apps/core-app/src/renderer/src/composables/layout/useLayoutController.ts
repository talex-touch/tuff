import type { Composer } from 'vue-i18n'
import { useI18n } from 'vue-i18n'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useRoute } from 'vue-router'
import { useApplicationUpgrade } from '~/modules/hooks/useUpdate'

/**
 * Shared layout controller logic for Flat and Simple layouts
 * @returns Route, translation function, and upgrade handler
 */
export function useLayoutController(): {
  route: RouteLocationNormalizedLoaded
  t: Composer['t']
  handleUpgradeClick: () => void
} {
  const route = useRoute()
  const { t } = useI18n()
  const { checkApplicationUpgrade } = useApplicationUpgrade()

  function handleUpgradeClick() {
    void checkApplicationUpgrade()
  }

  return {
    route,
    t,
    handleUpgradeClick,
  }
}
