import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { NativeTransport } from './native-transport'
import { capability, FakeNativeCarrier, successResponse } from './native-transport.test-helpers'

/**
 * Image bytes must travel as attachments, never inside the JSON control channel (#927).
 *
 * That guarantee was stated only by native-screenshot-macos.integration.test.ts, which runs
 * behind TUFF_SCREENSHOT_MACOS_INTEGRATION=1 — set in no workflow, script or mise task. So
 * the assertion existed and had never executed: a change to NativeTransport that serialised
 * captured screen bytes into the JSON payload would have shipped unnoticed.
 *
 * It does not need a real screen. The property is about how the transport frames a response,
 * so it is exercised here against a fake carrier and runs on every machine, every run.
 * The macOS file keeps the parts that genuinely need a display.
 */

/** Recognisable bytes: a PNG signature followed by a marker that must not appear in JSON. */
const IMAGE_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('SCREEN-PIXELS-DO-NOT-SERIALISE')
])

function createTransport() {
  const carrier = new FakeNativeCarrier('fixture', [capability('screenshot.capture')])
  carrier.invokeImpl = async (control) =>
    successResponse(
      control,
      {
        // Metadata only — what a caller needs to interpret the attachment.
        mimeType: 'image/png',
        width: 1280,
        height: 800,
        imageParts: [{ attachmentId: 'output-0', offset: 0, byteLength: IMAGE_BYTES.byteLength }]
      },
      [IMAGE_BYTES]
    )

  const logger = { info: vi.fn(), warn: vi.fn() }
  return { transport: new NativeTransport({ carriers: [carrier], logger }), logger, carrier }
}

describe('screenshot response framing', () => {
  it('delivers the image bytes as an attachment', async () => {
    // Positive control: a transport that dropped attachments would satisfy every "not in the
    // JSON" assertion below while losing the image.
    const { transport } = createTransport()
    await transport.initialize()

    const result = await transport.invoke('screenshot.capture', 'capture', {})

    expect(result.attachments[0]?.equals(IMAGE_BYTES)).toBe(true)
    await transport.dispose()
  })

  it('keeps the image bytes out of the JSON value', async () => {
    // The guarantee the dormant test was carrying.
    const { transport } = createTransport()
    await transport.initialize()

    const result = await transport.invoke('screenshot.capture', 'capture', {})

    const serialised = JSON.stringify(result.value)
    expect(serialised).not.toContain('SCREEN-PIXELS-DO-NOT-SERIALISE')
    expect(serialised).not.toContain(IMAGE_BYTES.toString('base64'))
    expect(result.value).toMatchObject({ mimeType: 'image/png', width: 1280, height: 800 })
    await transport.dispose()
  })

  it('keeps the image bytes out of the logs', async () => {
    // A payload logged verbatim is the same leak by another route, and the sibling test in
    // native-transport.test.ts shows payload logging is a live concern here.
    const { transport, logger } = createTransport()
    await transport.initialize()
    await transport.invoke('screenshot.capture', 'capture', {})

    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls])
    expect(logged).not.toContain('SCREEN-PIXELS-DO-NOT-SERIALISE')
    await transport.dispose()
  })

  it('describes the attachment by reference rather than by content', async () => {
    // imageParts is how a caller finds the bytes; it must carry ids and offsets, not data.
    const { transport } = createTransport()
    await transport.initialize()

    const result = await transport.invoke<
      Record<string, never>,
      {
        imageParts: Array<{ attachmentId: string; offset: number; byteLength: number }>
      }
    >('screenshot.capture', 'capture', {})

    expect(result.value.imageParts[0]).toEqual({
      attachmentId: 'output-0',
      offset: 0,
      byteLength: IMAGE_BYTES.byteLength
    })
    await transport.dispose()
  })
})
