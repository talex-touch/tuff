import type { BrowserWindow } from 'electron'
import { nativeImage } from 'electron'
import { TouchWindow } from '../../../core/touch-window'

export interface ImageTranslatePinWindowPayload {
  translatedImageBase64: string
  imageMimeType?: string
  sourceText?: string
  targetText?: string
  overlay?: unknown
}

const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 520

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function resolveImageMimeType(value: string | undefined): string {
  return value?.startsWith('image/') ? value : 'image/png'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildHtml(payload: ImageTranslatePinWindowPayload): string {
  const sourceText = payload.sourceText?.trim()
  const targetText = payload.targetText?.trim()
  const imageSrc = `data:${resolveImageMimeType(payload.imageMimeType)};base64,${payload.translatedImageBase64}`
  const shouldRenderClientOverlay =
    isRecord(payload.overlay) && payload.overlay.mode === 'client-render' && Boolean(targetText)

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';" />
  <title>Image Translation</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #111318;
      color: #f4f6fb;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
      background: #111318;
    }
    header {
      -webkit-app-region: drag;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 42px;
      padding: 0 14px;
      border-bottom: 1px solid rgba(255, 255, 255, .08);
      background: rgba(24, 27, 34, .92);
      font-size: 13px;
      font-weight: 600;
    }
    main {
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 16px;
    }
    .stage {
      position: relative;
      display: grid;
      place-items: center;
      max-width: 100%;
      max-height: calc(100vh - 126px);
    }
    img {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 126px);
      object-fit: contain;
      border-radius: 6px;
      background: rgba(255, 255, 255, .04);
      box-shadow: 0 16px 48px rgba(0, 0, 0, .32);
    }
    .overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 45%;
      overflow: auto;
      padding: 14px 18px 16px;
      border-radius: 0 0 6px 6px;
      color: #fff;
      background: rgba(17, 24, 39, .82);
      font-size: clamp(16px, 2.6vw, 28px);
      font-weight: 650;
      line-height: 1.35;
      text-shadow: 0 1px 2px rgba(0, 0, 0, .5);
      box-sizing: border-box;
    }
    footer {
      min-height: 48px;
      max-height: 112px;
      overflow: auto;
      padding: 10px 14px 12px;
      border-top: 1px solid rgba(255, 255, 255, .08);
      color: rgba(244, 246, 251, .78);
      font-size: 12px;
      line-height: 1.45;
      background: rgba(17, 19, 24, .94);
    }
    .row + .row {
      margin-top: 4px;
    }
    .label {
      color: rgba(244, 246, 251, .52);
      margin-right: 8px;
    }
  </style>
</head>
<body>
  <header>
    <span>Image Translation</span>
    <span>Always on Top</span>
  </header>
  <main>
    <div class="stage">
      <img src="${imageSrc}" alt="Translated image" />
      ${shouldRenderClientOverlay ? `<div class="overlay">${escapeHtml(targetText!)}</div>` : ''}
    </div>
  </main>
  <footer>
    ${sourceText ? `<div class="row"><span class="label">Source</span>${escapeHtml(sourceText)}</div>` : ''}
    ${targetText ? `<div class="row"><span class="label">Target</span>${escapeHtml(targetText)}</div>` : ''}
  </footer>
</body>
</html>`
}

function resolveWindowSize(image: Electron.NativeImage): { width: number; height: number } {
  const size = image.getSize()
  if (size.width <= 0 || size.height <= 0) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }

  const maxImageWidth = 920
  const maxImageHeight = 680
  const scale = Math.min(maxImageWidth / size.width, maxImageHeight / size.height, 1)
  return {
    width: Math.max(420, Math.round(size.width * scale) + 48),
    height: Math.max(320, Math.round(size.height * scale) + 138)
  }
}

export async function openImageTranslatePinWindow(
  payload: ImageTranslatePinWindowPayload
): Promise<BrowserWindow> {
  const image = nativeImage.createFromBuffer(Buffer.from(payload.translatedImageBase64, 'base64'))
  const { width, height } = resolveWindowSize(image)
  const touchWindow = new TouchWindow({
    width,
    height,
    minWidth: 360,
    minHeight: 260,
    autoShow: true,
    frame: true,
    title: 'Image Translation',
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  touchWindow.window.setAlwaysOnTop(true, 'floating')
  await touchWindow.window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(payload))}`
  )
  return touchWindow.window
}
