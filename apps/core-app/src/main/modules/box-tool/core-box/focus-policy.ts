export class CoreBoxFocusPolicy {
  private suppressBlurHideUntil = 0
  private blurHideTimer: ReturnType<typeof setTimeout> | null = null
  private pinned = false

  public beginFocusGrace(durationMs: number, now = Date.now()): void {
    this.suppressBlurHideUntil = now + durationMs
  }

  public isBlurHideSuppressed(now = Date.now()): boolean {
    return now < this.suppressBlurHideUntil
  }

  public clearPendingBlurHide(): void {
    if (!this.blurHideTimer)
      return
    clearTimeout(this.blurHideTimer)
    this.blurHideTimer = null
  }

  public scheduleBlurHide(callback: () => void | Promise<void>, delayMs: number): void {
    this.clearPendingBlurHide()
    this.blurHideTimer = setTimeout(() => {
      this.blurHideTimer = null
      void callback()
    }, delayMs)
  }

  public setPinned(pinned: boolean): void {
    this.pinned = pinned
  }

  public isPinned(): boolean {
    return this.pinned
  }
}
