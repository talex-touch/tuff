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

/**
 * The hint under the action grid. An issue is explained by its code alone: the capture's own message
 * is an English diagnostic, so the panel no longer appends it.
 */
export function resolveOmniPanelSelectionRecovery(
  input: OmniPanelSelectionRecoveryInput
): OmniPanelSelectionRecoveryHint {
  if (input.hasSelection && normalizeSelectionText(input.selectedText)) {
    return {
      tone: 'neutral',
      labelKey: 'corebox.omniPanel.selectionHint.ready',
      fallback: 'Selection ready.',
      detail: createOmniPanelSelectionPreview(input.selectedText)
    }
  }

  // Checked before the support level, which a skipped capture also reports as unsupported. The panel
  // skips the capture only on macOS without Accessibility permission.
  if (input.issueCode === 'disabled') {
    return {
      tone: 'warning',
      labelKey: 'corebox.omniPanel.selectionHint.disabled',
      fallback: 'Allow Accessibility access to read the selected text.',
      detail: null
    }
  }

  // Otherwise this is Linux without xdotool in practice; macOS and Windows attempt the capture.
  if (input.issueCode === 'unsupported' || input.supportLevel === 'unsupported') {
    return {
      tone: 'warning',
      labelKey: 'corebox.omniPanel.selectionHint.unsupported',
      fallback: "Can't read the selected text here. On Linux, install xdotool.",
      detail: null
    }
  }

  if (input.issueCode === 'failed') {
    return {
      tone: 'danger',
      labelKey: 'corebox.omniPanel.selectionHint.failed',
      fallback: 'Selected-text capture failed. Check desktop automation permissions, then retry.',
      detail: null
    }
  }

  return {
    tone: 'neutral',
    labelKey: 'corebox.omniPanel.selectionHint.empty',
    fallback: 'Select text, then choose an action.',
    detail: null
  }
}
