import type {
  OmniPanelFeatureExecuteErrorCode,
  OmniPanelFeatureItemPayload,
  OmniPanelFeatureUnavailableCode
} from '../../../../shared/events/omni-panel'
import { resolveI18nText } from '../../modules/lang/resolve-i18n-text'
import type { Translate } from '../../modules/lang/useI18nText'

/**
 * A feature as the panel shows it. Main sends built-in titles as `$i18n:` markers and says why a
 * feature can't run in English, for its logs; both are worded here, in the panel's language, before
 * the list is searched or shown.
 */
export function wordOmniPanelFeature(
  item: OmniPanelFeatureItemPayload,
  t: Translate
): OmniPanelFeatureItemPayload {
  return {
    ...item,
    title: resolveI18nText(item.title, t),
    subtitle: resolveI18nText(item.subtitle, t),
    unavailableReason: item.unavailableReason && {
      ...item.unavailableReason,
      message: describeOmniPanelUnavailableReason(item.unavailableReason.code, t)
    }
  }
}

export function describeOmniPanelUnavailableReason(
  code: OmniPanelFeatureUnavailableCode,
  t: Translate
): string {
  switch (code) {
    case 'PLUGIN_NOT_FOUND':
      return t('corebox.omniPanel.pluginNotLoaded')
    case 'FEATURE_NOT_FOUND':
      return t('corebox.omniPanel.featureMissing')
    case 'FEATURE_NOT_EXECUTABLE':
      return t('corebox.omniPanel.featureNotRunnable')
    default:
      return t('corebox.omniPanel.featureUnavailable')
  }
}

/**
 * What the toast says when main refuses or fails a feature. Main's `error` text is English and is
 * logged instead; a code with nothing more specific to say gets the general failure.
 */
export function describeOmniPanelExecuteError(
  code: OmniPanelFeatureExecuteErrorCode | undefined,
  t: Translate
): string {
  switch (code) {
    case 'SELECTION_REQUIRED':
      return t('corebox.omniPanel.selectionRequired')
    case 'FEATURE_NOT_FOUND':
      return t('corebox.omniPanel.featureMissing')
    case 'FEATURE_UNAVAILABLE':
      return t('corebox.omniPanel.featureUnavailable')
    case 'PLUGIN_NOT_FOUND':
      return t('corebox.omniPanel.pluginNotLoaded')
    case 'SYSTEM_TARGET_NOT_IMPLEMENTED':
      return t('corebox.omniPanel.featureNotRunnable')
    case 'COREBOX_UNAVAILABLE':
      return t('corebox.omniPanel.coreboxUnavailable')
    case 'COREBOX_TRANSFER_FAILED':
      return t('corebox.omniPanel.coreboxTransferFailed')
    default:
      return t('corebox.omniPanel.executeFailed')
  }
}
