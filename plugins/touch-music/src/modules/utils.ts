import { computed, customRef } from 'vue'

export function useModelWrapper(props: any, emit: any, name = 'modelValue') {
  return computed({
    get: () => props[name],
    set: value => emit(`update:${name}`, value),
  })
}

export function throttleFunction(func: Function, time: number = 100) {
  let ts = 0
  return function () {
    if (new Date().getTime() - ts < time)
      return

    func.apply(this, arguments)
    ts = new Date().getTime()
  }
}

export function debounceFunction(func: Function, time: number = 100) {
  let timer: any = null
  return function () {
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      func.apply(this, arguments)
      timer = null
    }, time)
  }
}

export function throttleRef(value: any, time: number = 100) {
  let ts = 0

  return customRef((track, trigger) => {
    return {
      get() {
        track()
        return value
      },
      set(newValue) {
        if (new Date().getTime() - ts < time)
          return

        value = newValue
        track()
        trigger()
        ts = new Date().getTime()
      },
    }
  })
}

export function debounceRef(value: any, delay: number) {
  let timer: any

  return customRef((track, trigger) => {
    return {
      get() {
        track()
        return value
      },
      set(newValue) {
        clearTimeout(timer)
        timer = setTimeout(() => {
          value = newValue
          track()
          trigger()
        }, delay)
      },
    }
  })
}

export async function sleep(time: number) {
  return new Promise(resolve => setTimeout(() => resolve(time), time))
}

export function formatDuration(milliseconds: number, includeMs = false): string {
  const safeMs = Number.isFinite(milliseconds) && milliseconds > 0 ? Math.floor(milliseconds) : 0
  const totalSeconds = Math.floor(safeMs / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  if (!includeMs) {
    return `${minutes}:${seconds}`
  }
  const ms = String(safeMs % 1000).padStart(3, '0')
  return `${minutes}:${seconds}:${ms}`
}
