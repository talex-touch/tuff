export interface UpdateDialogPresentationOptions {
  bypassSuppression?: boolean
}

function normalizeTag(tag: string): string {
  return tag.trim()
}

export class UpdateDialogSession {
  private readonly presentingTags = new Set<string>()
  private readonly pendingActionTags = new Set<string>()
  private readonly suppressedTags = new Set<string>()

  beginPresentation(tag: string, options?: UpdateDialogPresentationOptions): boolean {
    const normalizedTag = normalizeTag(tag)
    if (!normalizedTag) {
      return false
    }

    if (this.presentingTags.has(normalizedTag) || this.pendingActionTags.has(normalizedTag)) {
      return false
    }

    if (!options?.bypassSuppression && this.suppressedTags.has(normalizedTag)) {
      return false
    }

    this.presentingTags.add(normalizedTag)
    return true
  }

  endPresentation(tag: string): void {
    const normalizedTag = normalizeTag(tag)
    if (!normalizedTag) {
      return
    }
    this.presentingTags.delete(normalizedTag)
  }

  beginAction(tag: string): boolean {
    const normalizedTag = normalizeTag(tag)
    if (!normalizedTag || this.pendingActionTags.has(normalizedTag)) {
      return false
    }

    this.presentingTags.delete(normalizedTag)
    this.pendingActionTags.add(normalizedTag)
    return true
  }

  finishAction(tag: string, suppress = false): void {
    const normalizedTag = normalizeTag(tag)
    if (!normalizedTag) {
      return
    }

    this.pendingActionTags.delete(normalizedTag)
    if (suppress) {
      this.suppressedTags.add(normalizedTag)
    }
  }

  failAction(tag: string): void {
    const normalizedTag = normalizeTag(tag)
    if (!normalizedTag) {
      return
    }
    this.pendingActionTags.delete(normalizedTag)
  }
}

export function createUpdateDialogSession(): UpdateDialogSession {
  return new UpdateDialogSession()
}

export const updateDialogSession = createUpdateDialogSession()
