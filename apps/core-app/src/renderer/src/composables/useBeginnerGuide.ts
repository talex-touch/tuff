import { nextTick, readonly, ref } from 'vue'

/**
 * Module-level so the settings page can reopen the wizard that App.vue owns. Visibility is kept
 * separate from `appSetting.beginner.init` on purpose: that flag also admits CoreBox and search
 * in the main process, so driving the overlay through it would disable the launcher for as long
 * as the user is reading the guide. Only the wizard's final step writes it.
 */
const visible = ref(false)

export function useBeginnerGuide() {
  function open(): void {
    visible.value = true
  }

  function close(): void {
    visible.value = false
  }

  /**
   * Remounting is required, not cosmetic: the wizard's last step hides itself by writing
   * `display: none` onto its own root element rather than by clearing this flag, so a wizard
   * that already finished in this session would stay invisible if we only flipped `visible`
   * back on. Tearing it down with `v-if` is what resets those inline styles.
   */
  async function rerun(): Promise<void> {
    visible.value = false
    await nextTick()
    open()
  }

  return {
    visible: readonly(visible),
    open,
    close,
    rerun
  }
}
