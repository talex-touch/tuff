import { onBeforeUnmount, Ref } from 'vue'
import { IBoxOptions } from '..'

export function useKeyboard(
  boxOptions: IBoxOptions,
  res: Ref<any[]>,
  select: Ref<number>,
  scrollbar: Ref<any>,
  searchVal: Ref<string>,
  handleExecute: (item: any) => void,
  handleExit: () => void,
  inputEl: Ref<HTMLInputElement | undefined>
) {
  function onKeyDown(event: KeyboardEvent): void {
    if (!document.body.classList.contains('core-box')) {
      return
    }

    const lastFocus = boxOptions.focus

    if (event.key === 'Enter') {
      select.value = boxOptions.focus
      const target = res.value[boxOptions.focus]

      handleExecute(target)
    } else if (event.key === 'ArrowDown') {
      boxOptions.focus += 1
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      boxOptions.focus -= 1
      event.preventDefault()
    } else if (event.key === 'Tab') {
      if (res.value[boxOptions.focus]) {
        const completion =
          res.value[boxOptions.focus].render.completion ??
          res.value[boxOptions.focus].render.basic?.title ??
          ''
        searchVal.value = completion

        if (inputEl.value) {
          requestAnimationFrame(() => {
            inputEl.value!.setSelectionRange(completion.length, completion.length)
          })
        }
      }
      event.preventDefault()
    } else if (event.key === 'Escape') {
      handleExit()
    }

    if (boxOptions.focus < 0) {
      boxOptions.focus = 0
    } else if (boxOptions.focus > res.value.length - 1) {
      boxOptions.focus = res.value.length - 1
    }

    const diff = Math.max(0, boxOptions.focus * 48)

    const sb = scrollbar.value

    if (lastFocus < boxOptions.focus) {
      if (diff <= 48 * 9) return

      sb.scrollTo(0, diff - 48 * 9)
    } else {
      const mod = boxOptions.focus / 9
      if (!mod) return

      sb.scrollTo(0, diff - 48 * 9)
    }
  }

  document.addEventListener('keydown', onKeyDown)

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown)
  })
}
