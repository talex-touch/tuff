export type OmniPanelSelectionIssueCode =
  | 'disabled'
  | 'empty'
  | 'failed'
  | 'unsupported'
  | undefined
export type OmniPanelSelectionSupportLevel = 'supported' | 'best_effort' | 'unsupported' | undefined

export interface OmniPanelSelectionRecoveryInput {
  hasSelection: boolean
  selectedText: string
  issueCode?: OmniPanelSelectionIssueCode
  issueMessage?: string
  supportLevel?: OmniPanelSelectionSupportLevel
}

export interface OmniPanelSelectionRecoveryHint {
  tone: 'neutral' | 'warning' | 'danger'
  labelKey: string
  fallback: string
  detail: string | null
}

function normalizeSelectionText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function createOmniPanelSelectionPreview(value: string, maxLength = 24): string {
  const normalized = normalizeSelectionText(value)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

export function resolveOmniPanelSelectionRecovery(
  input: OmniPanelSelectionRecoveryInput
): OmniPanelSelectionRecoveryHint {
  const detail = input.issueMessage?.trim() || null

  if (input.hasSelection && normalizeSelectionText(input.selectedText)) {
    return {
      tone: 'neutral',
      labelKey: 'corebox.omniPanel.selectionHint.ready',
      fallback: 'Selection ready.',
      detail: createOmniPanelSelectionPreview(input.selectedText)
    }
  }

  if (input.issueCode === 'unsupported' || input.supportLevel === 'unsupported') {
    return {
      tone: 'warning',
      labelKey: 'corebox.omniPanel.selectionHint.unsupported',
      fallback: 'Selected-text capture is not supported here. Paste text or use clipboard input.',
      detail
    }
  }

  if (input.issueCode === 'failed') {
    return {
      tone: 'danger',
      labelKey: 'corebox.omniPanel.selectionHint.failed',
      fallback: 'Selected-text capture failed. Check desktop automation permissions, then retry.',
      detail
    }
  }

  if (input.issueCode === 'disabled') {
    return {
      tone: 'warning',
      labelKey: 'corebox.omniPanel.selectionHint.disabled',
      fallback:
        'Selected-text capture is disabled. Enable OmniPanel capture or paste text manually.',
      detail
    }
  }

  return {
    tone: 'neutral',
    labelKey: 'corebox.omniPanel.selectionHint.empty',
    fallback: 'Select text, then choose an action.',
    detail: null
  }
}
