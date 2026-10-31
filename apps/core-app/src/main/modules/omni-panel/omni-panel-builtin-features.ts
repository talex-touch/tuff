import type {
  OmniPanelFeatureExecuteErrorCode,
  OmniPanelFeatureIconPayload
} from '../../../shared/events/omni-panel'
import { i18nMsg } from '@talex-touch/utils/i18n'

/**
 * What each failure code means, for logs and for callers that read the response. The panel words a
 * failure by its code in the language it shows (`describeOmniPanelExecuteError`), not with these.
 */
export const OMNI_PANEL_EXECUTE_ERROR_MESSAGES: Record<OmniPanelFeatureExecuteErrorCode, string> = {
  INVALID_PAYLOAD: 'Invalid execute payload',
  INVALID_FEATURE: 'Invalid feature id',
  FEATURE_NOT_FOUND: 'Feature not found',
  FEATURE_UNAVAILABLE: 'Feature is unavailable',
  SELECTION_REQUIRED: 'Selected text is required',
  COREBOX_UNAVAILABLE: 'CoreBox window is unavailable',
  COREBOX_TRANSFER_FAILED: 'Failed to transfer context to CoreBox',
  SYSTEM_TARGET_NOT_IMPLEMENTED: 'System transfer target is unavailable for this feature',
  PLUGIN_NOT_FOUND: 'Plugin not found',
  FEATURE_EXECUTION_FAILED: 'Failed to execute feature',
  UNKNOWN_BUILTIN: 'Unknown builtin feature',
  INTERNAL_ERROR: 'Internal error'
}

/**
 * Titles and subtitles are `$i18n:` markers: only the OmniPanel window reads the feature list, and
 * it resolves them in the language it shows.
 */
export const OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS = [
  {
    id: 'builtin.translate',
    title: i18nMsg('corebox.omniPanel.translate'),
    subtitle: i18nMsg('corebox.omniPanel.translateDesc'),
    icon: { type: 'class', value: 'i-ri-translate-2' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.ai.translate',
    title: i18nMsg('corebox.omniPanel.aiTranslate'),
    subtitle: i18nMsg('corebox.omniPanel.aiTranslateDesc'),
    icon: { type: 'class', value: 'i-ri-translate' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.ai.summarize',
    title: i18nMsg('corebox.omniPanel.aiSummarize'),
    subtitle: i18nMsg('corebox.omniPanel.aiSummarizeDesc'),
    icon: { type: 'class', value: 'i-ri-file-list-3-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.ai.rewrite',
    title: i18nMsg('corebox.omniPanel.aiRewrite'),
    subtitle: i18nMsg('corebox.omniPanel.aiRewriteDesc'),
    icon: { type: 'class', value: 'i-ri-edit-2-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.ai.explain',
    title: i18nMsg('corebox.omniPanel.aiExplain'),
    subtitle: i18nMsg('corebox.omniPanel.aiExplainDesc'),
    icon: { type: 'class', value: 'i-ri-question-answer-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.ai.review',
    title: i18nMsg('corebox.omniPanel.aiReview'),
    subtitle: i18nMsg('corebox.omniPanel.aiReviewDesc'),
    icon: { type: 'class', value: 'i-ri-git-pull-request-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.search',
    title: i18nMsg('corebox.omniPanel.search'),
    subtitle: i18nMsg('corebox.omniPanel.searchDesc'),
    icon: { type: 'class', value: 'i-ri-search-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.corebox-search',
    title: i18nMsg('corebox.omniPanel.coreBoxSearch'),
    subtitle: i18nMsg('corebox.omniPanel.coreBoxSearchDesc'),
    icon: { type: 'class', value: 'i-ri-command-line' } as OmniPanelFeatureIconPayload,
    target: 'corebox' as const
  },
  {
    id: 'builtin.copy',
    title: i18nMsg('corebox.omniPanel.copy'),
    subtitle: i18nMsg('corebox.omniPanel.copyDesc'),
    icon: { type: 'class', value: 'i-ri-file-copy-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  }
] as const

export const OMNI_PANEL_BUILTIN_FEATURE_MAP: Map<
  string,
  (typeof OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS)[number]
> = new Map(OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS.map((item) => [item.id, item] as const))
