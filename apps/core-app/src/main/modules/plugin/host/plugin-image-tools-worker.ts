import { parentPort } from 'node:worker_threads'
import type { PluginImageToolsRenderRequest } from './plugin-image-tools-capabilities'
import { createSharpPluginImageToolsRenderer } from './plugin-image-tools-renderer'

const SAFE_ERROR_CODES = new Set([
  'PLUGIN_HOST_CAPABILITY_CANCELLED',
  'PLUGIN_IMAGE_TOOLS_ANIMATED_INPUT',
  'PLUGIN_IMAGE_TOOLS_ICO_SQUARE_REQUIRED',
  'PLUGIN_IMAGE_TOOLS_INPUT_TOO_LARGE',
  'PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS',
  'PLUGIN_IMAGE_TOOLS_OUTPUT_TOO_LARGE',
  'PLUGIN_IMAGE_TOOLS_UNSUPPORTED_FORMAT'
])

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || Array.isArray(error))
    return 'PLUGIN_IMAGE_TOOLS_RENDER_FAILED'
  const code = Object.getOwnPropertyDescriptor(error, 'code')?.value
  return typeof code === 'string' && SAFE_ERROR_CODES.has(code)
    ? code
    : 'PLUGIN_IMAGE_TOOLS_RENDER_FAILED'
}

const port = parentPort
if (!port) throw new Error('PLUGIN_IMAGE_TOOLS_WORKER_PORT_UNAVAILABLE')

port.once('message', async (message: unknown) => {
  try {
    if (!message || typeof message !== 'object' || Array.isArray(message))
      throw new Error('PLUGIN_IMAGE_TOOLS_WORKER_INVALID_REQUEST')
    const operation = Object.getOwnPropertyDescriptor(message, 'operation')?.value
    const sourceValue = Object.getOwnPropertyDescriptor(message, 'source')?.value
    if ((operation !== 'inspect' && operation !== 'render') || !(sourceValue instanceof Uint8Array))
      throw new Error('PLUGIN_IMAGE_TOOLS_WORKER_INVALID_REQUEST')

    const renderer = createSharpPluginImageToolsRenderer()
    const source = Buffer.from(sourceValue.buffer, sourceValue.byteOffset, sourceValue.byteLength)
    if (operation === 'inspect') {
      const result = await renderer.inspect(source, new AbortController().signal)
      port.postMessage({ ok: true, result })
      return
    }

    const request = Object.getOwnPropertyDescriptor(message, 'request')?.value
    const rendered = await renderer.render(
      source,
      request as PluginImageToolsRenderRequest,
      new AbortController().signal
    )
    const data = Uint8Array.from(rendered.data)
    port.postMessage(
      {
        ok: true,
        result: { data, width: rendered.width, height: rendered.height }
      },
      [data.buffer]
    )
  } catch (error) {
    port.postMessage({ ok: false, code: errorCode(error) })
  }
})
