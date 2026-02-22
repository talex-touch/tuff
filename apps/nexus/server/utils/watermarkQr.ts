import jsQR from 'jsqr'

export function decodeQrFromLuma(luma: number[], width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < luma.length; i += 1) {
    const value = luma[i]
    const idx = i * 4
    data[idx] = value
    data[idx + 1] = value
    data[idx + 2] = value
    data[idx + 3] = 255
  }
  const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
  return result?.data ?? null
}
