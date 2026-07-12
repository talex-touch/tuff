import { ref, watchEffect } from 'vue'
import { sleep } from '@talex-touch/utils/common/utils'

export type DialogButtonType = 'info' | 'warning' | 'error' | 'success'

export interface DialogButton {
  content: string
  type?: DialogButtonType
  time?: number
  onClick: () => Promise<boolean> | boolean
  loading?: (done: () => void) => void
}

export interface DialogButtonState {
  content: string
  type?: DialogButtonType
  time?: number
  onClick: () => Promise<boolean> | boolean
  loading: boolean
}

export interface DialogButtonEntry {
  value: DialogButtonState
}

/**
 * Resolves dialog button loading state, actions, and optional countdown actions.
 */
export function useDialogButtons(
  getButtons: () => readonly DialogButton[],
  onAccepted: () => Promise<void> | void
) {
  const buttonStates = ref<DialogButtonEntry[]>([])

  async function runButtonAction(button: DialogButtonEntry): Promise<void> {
    if (button.value.loading) return

    button.value.loading = true
    await sleep(200)

    if (await button.value.onClick()) await onAccepted()

    button.value.loading = false
  }

  watchEffect((onCleanup) => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const buttons = getButtons().map<DialogButtonEntry>((button) => {
      const entry: DialogButtonEntry = {
        value: {
          content: button.content,
          type: button.type,
          time: button.time,
          onClick: button.onClick,
          loading: false
        }
      }

      if (button.loading) {
        entry.value.loading = true
        button.loading(() => {
          entry.value.loading = false
        })
      }

      if (entry.value.time && entry.value.time > 0) {
        const refresh = (): void => {
          timers.push(
            setTimeout(() => {
              if (!entry.value.time || entry.value.time <= 0) return

              entry.value.time -= 1
              if (entry.value.time <= 0) {
                void runButtonAction(entry)
                return
              }

              refresh()
            }, 1000)
          )
        }

        refresh()
      }

      return entry
    })

    buttonStates.value = buttons
    onCleanup(() => {
      for (const timer of timers) clearTimeout(timer)
    })
  })

  return { buttonStates, runButtonAction }
}
