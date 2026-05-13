import type {
  OmniPanelFeatureExecuteErrorCode,
  OmniPanelFeatureIconPayload
} from '../../../shared/events/omni-panel'

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

export const OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS = [
  {
    id: 'builtin.translate',
    title: '快速翻译',
    subtitle: '将选中文本发送到翻译页面',
    icon: { type: 'class', value: 'i-ri-translate-2' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.search',
    title: '网页搜索',
    subtitle: '用浏览器搜索选中文本',
    icon: { type: 'class', value: 'i-ri-search-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.corebox-search',
    title: '在 CoreBox 中搜索',
    subtitle: '回到启动器继续执行动作',
    icon: { type: 'class', value: 'i-ri-command-line' } as OmniPanelFeatureIconPayload,
    target: 'corebox' as const
  },
  {
    id: 'builtin.copy',
    title: '复制文本',
    subtitle: '把当前文本写回剪贴板',
    icon: { type: 'class', value: 'i-ri-file-copy-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  }
] as const

export const OMNI_PANEL_BUILTIN_FEATURE_MAP: Map<
  string,
  (typeof OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS)[number]
> = new Map(OMNI_PANEL_BUILTIN_FEATURE_DEFINITIONS.map((item) => [item.id, item] as const))
