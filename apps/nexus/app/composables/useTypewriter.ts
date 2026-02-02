import { ref } from 'vue'

export function useTypewriter(text: string, speed = 40) {
  const displayed = ref('')
  const isTyping = ref(false)
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  async function start() {
    if (isTyping.value)
      return

    isTyping.value = true
    displayed.value = ''

    for (let i = 0; i <= text.length; i++) {
      displayed.value = text.slice(0, i)
      await new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => resolve(), speed)
      })
    }

    isTyping.value = false
  }

  function stop() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    displayed.value = text
    isTyping.value = false
  }

  function reset() {
    stop()
    displayed.value = ''
  }

  return { displayed, isTyping, start, stop, reset }
}
