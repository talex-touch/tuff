import { Buffer } from 'node:buffer'
import type { ImageAddon } from '@xterm/addon-image'
import type { Terminal as XtermTerminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKittyGraphicsAdapter, KITTY_INTERNAL_OSC } from '../src/kitty-graphics'

function createFakeTerminal(cols = 100, rows = 30) {
  const oscHandlers = new Map<number, (data: string) => boolean>()
  const bufferChangeListeners = new Set<() => void>()
  const refreshed: Array<[number, number]> = []
  const addedImages: Array<{ width: number, height: number, x: number, y: number, scrollBottom: number }> = []
  const deletedStorageIds: number[] = []
  let lastStorageId = 0

  const coreBuffer = {
    x: 0,
    y: 0,
    scrollBottom: rows - 2,
  }

  const activeBuffer = {
    type: 'alternate' as 'normal' | 'alternate',
    get cursorX() { return coreBuffer.x },
    get cursorY() { return coreBuffer.y },
  }

  const terminal = {
    cols,
    rows,
    buffer: {
      active: activeBuffer,
      onBufferChange(listener: () => void) {
        bufferChangeListeners.add(listener)
        return { dispose: () => bufferChangeListeners.delete(listener) }
      },
    },
    parser: {
      registerOscHandler(ident: number, cb: (data: string) => boolean) {
        oscHandlers.set(ident, cb)
        return { dispose: () => oscHandlers.delete(ident) }
      },
    },
    refresh(start: number, end: number) {
      refreshed.push([start, end])
    },
    _core: {
      buffer: coreBuffer,
    },
  }

  const storage = {
    get _lastId() { return lastStorageId },
    _needsFullClear: false,
    _fullyCleared: true,
    addImage(img: { width: number, height: number }) {
      lastStorageId += 1
      addedImages.push({
        width: img.width,
        height: img.height,
        x: coreBuffer.x,
        y: coreBuffer.y,
        scrollBottom: coreBuffer.scrollBottom,
      })
    },
    _delImg(id: number) {
      deletedStorageIds.push(id)
    },
  }

  const imageAddon = {
    _renderer: {
      cellSize: { width: 16, height: 32 },
    },
    _storage: storage,
  }

  /** Simulates xterm executing injected OSC 51337 markers and CUP sequences. */
  function dispatchTransformed(output: string): string {
    const oscPrefix = `\u001B]${KITTY_INTERNAL_OSC};`
    let idx = 0
    let plain = ''
    while (idx < output.length) {
      if (output.startsWith(oscPrefix, idx)) {
        const end = output.indexOf('\u0007', idx + oscPrefix.length)
        if (end >= 0) {
          oscHandlers.get(KITTY_INTERNAL_OSC)?.(output.slice(idx + oscPrefix.length, end))
          idx = end + 1
          continue
        }
      }
      if (output[idx] === '\u001B' && output[idx + 1] === '[') {
        const end = output.indexOf('H', idx + 2)
        if (end > idx + 2) {
          const params = output.slice(idx + 2, end)
          const match = /^(\d+);(\d+)$/.exec(params)
          if (match) {
            coreBuffer.y = Number.parseInt(match[1]!, 10) - 1
            coreBuffer.x = Number.parseInt(match[2]!, 10) - 1
            idx = end + 1
            continue
          }
        }
      }
      plain += output[idx]!
      idx += 1
    }
    return plain
  }

  return {
    terminal: terminal as unknown as XtermTerminal,
    imageAddon: imageAddon as unknown as ImageAddon,
    coreBuffer,
    storage,
    addedImages,
    deletedStorageIds,
    refreshed,
    dispatchTransformed,
  }
}

describe('createKittyGraphicsAdapter', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
    }) as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('replaces stale U+10EEEE Unicode placeholder cells with spaces even when no image payload exists', () => {
    const fx = createFakeTerminal()
    const adapter = createKittyGraphicsAdapter(fx.terminal, fx.imageAddon)

    const stale = '\u001B[38;2;0;38;120m\u001B[2;64H\u{10EEEE}\u0305\u0305\u{10EEEE}\u0305\u030D\u{10EEEE}\u0305\u030E|'
    const transformed = adapter.transform(stale) as string
    const plain = fx.dispatchTransformed(transformed)
    adapter.flush()

    expect(transformed).not.toContain('\u{10EEEE}')
    expect(transformed).not.toContain('\u0305')
    expect(plain).toContain('   |')
    expect(fx.addedImages).toHaveLength(0)

    adapter.dispose()
  })

  it('decodes chunked RGB Kitty images, places at exact cursor without scroll overflow, and clears on a=d', () => {
    const fx = createFakeTerminal(100, 30)
    const adapter = createKittyGraphicsAdapter(fx.terminal, fx.imageAddon)

    // 4x2 24-bit RGB image = 24 bytes
    const rgb = new Uint8Array(4 * 2 * 3).fill(0xAB)
    const b64 = Buffer.from(rgb).toString('base64')
    const part1 = b64.slice(0, 16)
    const part2 = b64.slice(16)

    // Image ID 15402 = RGB(0, 60, 42)
    const chunk1 = `\u001B_Gi=278941603,s=1,v=1,a=q,t=d,f=24;AAAA\u001B\\\u001B_Gq=2,a=T,C=1,U=1,f=24,s=4,v=2,i=15402,m=1;${part1}\u001B\\`
    const chunk2 = `\u001B_Gm=0;${part2}\u001B\\\u001B[38;2;0;60;42m\u001B[2;64H\u{10EEEE}\u0305\u0305\u{10EEEE}\u0305\u030D`

    const out1 = adapter.transform(chunk1) as string
    expect(out1).toBe('')
    fx.dispatchTransformed(out1)
    adapter.flush()

    const out2 = adapter.transform(chunk2) as string
    expect(out2).not.toContain('\u001B_G')
    expect(out2).not.toContain('\u{10EEEE}')
    fx.dispatchTransformed(out2)
    // Simulate xterm advancing cursor after writing spaces
    fx.coreBuffer.x = 65
    fx.coreBuffer.y = 1
    adapter.flush()

    expect(fx.addedImages).toEqual([
      { width: 4, height: 2, x: 63, y: 1, scrollBottom: 29 },
    ])
    // Cursor and DECSTBM scrollBottom must be restored intact.
    expect(fx.coreBuffer).toEqual({ x: 65, y: 1, scrollBottom: 28 })

    // Split-chunk continuation placeholder rows re-apply cached image and replace old storage id without leaking.
    const chunk3 = '\u001B[3;64H\u{10EEEE}\u030D\u0305\u{10EEEE}\u030D\u030D'
    const out3 = adapter.transform(chunk3) as string
    fx.dispatchTransformed(out3)
    adapter.flush()
    expect(fx.deletedStorageIds).toEqual([1])
    expect(fx.addedImages).toHaveLength(2)

    // Delete all images (a=d, d=A) clears the overlay and marks storage for full clear.
    const delOut = adapter.transform('\u001B_Gq=2,a=d,d=A\u001B\\') as string
    fx.dispatchTransformed(delOut)
    adapter.flush()
    expect(fx.deletedStorageIds).toEqual([1, 2])
    expect(fx.storage._needsFullClear).toBe(true)

    adapter.dispose()
  })

  it('handles direct Kitty placement (a=T without U=1) across split APC chunks', () => {
    const fx = createFakeTerminal(80, 24)
    const adapter = createKittyGraphicsAdapter(fx.terminal, fx.imageAddon)

    const rgba = new Uint8Array(2 * 2 * 4).fill(0xFF)
    const b64 = Buffer.from(rgba).toString('base64')
    const full = `\u001B[5;10H\u001B_Ga=T,f=32,s=2,v=2;${b64}\u001B\\`
    const splitAt = 15

    const outA = adapter.transform(full.slice(0, splitAt)) as string
    const outB = adapter.transform(full.slice(splitAt)) as string
    fx.dispatchTransformed(outA + outB)
    adapter.flush()

    expect(fx.addedImages).toHaveLength(1)
    expect(fx.addedImages[0]).toMatchObject({ width: 2, height: 2, x: 9, y: 4 })

    adapter.dispose()
  })
})
