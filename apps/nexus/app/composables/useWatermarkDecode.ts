import { ref } from 'vue'

interface ResolveResult {
  matched: boolean
  confidence: number
  decodedCode?: string | null
  record: null | {
    userId: string | null
    deviceId: string
    sessionId?: string | null
    shotId?: string | null
    trackedAt: number
    lastSeenAt: number
  }
}

function toLuma(data: Uint8ClampedArray) {
  const luma = new Array<number>(data.length / 4)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    luma[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return luma
}

export function useWatermarkDecode() {
  const resolving = ref(false)
  const error = ref('')
  const result = ref<ResolveResult | null>(null)

  async function resolveFile(file: File) {
    error.value = ''
    result.value = null
    if (!import.meta.client)
      return
    resolving.value = true
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx)
        throw new Error('canvas_unavailable')
      ctx.drawImage(bitmap, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const luma = toLuma(data.data)
      result.value = await $fetch<ResolveResult>('/api/watermark/resolve', {
        method: 'POST',
        body: {
          width: canvas.width,
          height: canvas.height,
          luma,
        },
      })
    }
    catch (e: any) {
      error.value = e?.data?.statusMessage || e?.message || 'resolve_failed'
    }
    finally {
      resolving.value = false
    }
  }

  return {
    resolving,
    error,
    result,
    resolveFile,
  }
}
