import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { Buffer } from 'node:buffer'
import { platform } from 'node:process'
import { clipboard, Menu, nativeImage, screen } from 'electron'
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
const MIN_PIN_WIDTH = 360
const MIN_PIN_HEIGHT = 260
const WORK_AREA_INSET = 16
const PIN_ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2] as const
const PIN_OPACITY_OPTIONS = [
  { label: '100%', value: 1 },
  { label: '85%', value: 0.85 },
  { label: '70%', value: 0.7 },
  { label: '55%', value: 0.55 },
] as const

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
    .replaceAll('\'', '&#39;')
}

function buildHtml(payload: ImageTranslatePinWindowPayload): string {
  const sourceText = payload.sourceText?.trim()
  const targetText = payload.targetText?.trim()
  const imageSrc = `data:${resolveImageMimeType(payload.imageMimeType)};base64,${payload.translatedImageBase64}`
  const shouldRenderClientOverlay
    = isRecord(payload.overlay) && payload.overlay.mode === 'client-render' && Boolean(targetText)

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
    .hint {
      color: rgba(244, 246, 251, .56);
      font-size: 11px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <header>
    <span>Image Translation</span>
    <span class="hint">Right-click: copy · zoom · opacity · close · Ctrl/⌘ +/- to zoom · Esc to close</span>
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

function resolveWindowSize(image: Electron.NativeImage): { width: number, height: number } {
  const size = image.getSize()
  if (size.width <= 0 || size.height <= 0) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }

  const maxImageWidth = 920
  const maxImageHeight = 680
  const scale = Math.min(maxImageWidth / size.width, maxImageHeight / size.height, 1)
  return {
    width: Math.max(420, Math.round(size.width * scale) + 48),
    height: Math.max(320, Math.round(size.height * scale) + 138),
  }
}

function resolveWindowBounds(image: Electron.NativeImage): {
  x?: number
  y?: number
  width: number
  height: number
} {
  const desired = resolveWindowSize(image)
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const workArea = display.workArea
    const width = Math.min(
      desired.width,
      Math.max(MIN_PIN_WIDTH, workArea.width - WORK_AREA_INSET * 2),
    )
    const height = Math.min(
      desired.height,
      Math.max(MIN_PIN_HEIGHT, workArea.height - WORK_AREA_INSET * 2),
    )
    return {
      x: workArea.x + Math.max(0, Math.round((workArea.width - width) / 2)),
      y: workArea.y + Math.max(0, Math.round((workArea.height - height) / 2)),
      width,
      height,
    }
  }
  catch {
    return desired
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function resolveZoomedWindowBounds(
  center: { x: number, y: number },
  baseSize: { width: number, height: number },
  zoom: number,
): Electron.Rectangle {
  let width = Math.max(MIN_PIN_WIDTH, Math.round(baseSize.width * zoom))
  let height = Math.max(MIN_PIN_HEIGHT, Math.round(baseSize.height * zoom))

  try {
    const workArea = screen.getDisplayNearestPoint({
      x: Math.round(center.x),
      y: Math.round(center.y),
    }).workArea
    width = Math.min(width, Math.max(MIN_PIN_WIDTH, workArea.width - WORK_AREA_INSET * 2))
    height = Math.min(height, Math.max(MIN_PIN_HEIGHT, workArea.height - WORK_AREA_INSET * 2))
    return {
      x: clamp(
        Math.round(center.x - width / 2),
        workArea.x,
        workArea.x + workArea.width - width,
      ),
      y: clamp(
        Math.round(center.y - height / 2),
        workArea.y,
        workArea.y + workArea.height - height,
      ),
      width,
      height,
    }
  }
  catch {
    return {
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
      width,
      height,
    }
  }
}

function registerPinWindowActions(
  window: BrowserWindow,
  image: Electron.NativeImage,
  payload: ImageTranslatePinWindowPayload,
): void {
  const sourceText = payload.sourceText?.trim()
  const targetText = payload.targetText?.trim()
  const initialBounds = window.getBounds()
  const baseSize = { width: initialBounds.width, height: initialBounds.height }
  let zoomIndex = PIN_ZOOM_LEVELS.indexOf(1)
  let zoomCenter = {
    x: initialBounds.x + initialBounds.width / 2,
    y: initialBounds.y + initialBounds.height / 2,
  }
  let lastZoomBounds = { ...initialBounds }

  const closeWindow = (): void => {
    if (!window.isDestroyed())
      window.close()
  }
  const applyZoomIndex = (nextIndex: number, force = false): void => {
    if (window.isDestroyed())
      return
    const currentBounds = window.getBounds()
    if (
      currentBounds.x !== lastZoomBounds.x
      || currentBounds.y !== lastZoomBounds.y
      || currentBounds.width !== lastZoomBounds.width
      || currentBounds.height !== lastZoomBounds.height
    ) {
      zoomCenter = {
        x: currentBounds.x + currentBounds.width / 2,
        y: currentBounds.y + currentBounds.height / 2,
      }
    }
    const normalizedIndex = clamp(Math.round(nextIndex), 0, PIN_ZOOM_LEVELS.length - 1)
    if (!force && normalizedIndex === zoomIndex)
      return
    zoomIndex = normalizedIndex
    const nextBounds = resolveZoomedWindowBounds(
      zoomCenter,
      baseSize,
      PIN_ZOOM_LEVELS[zoomIndex],
    )
    window.setBounds(nextBounds)
    lastZoomBounds = nextBounds
  }
  const stepZoom = (direction: -1 | 1): void => {
    applyZoomIndex(zoomIndex + direction)
  }
  const resetZoom = (): void => {
    applyZoomIndex(PIN_ZOOM_LEVELS.indexOf(1), true)
  }
  const applyOpacity = (opacity: number): void => {
    if (!window.isDestroyed())
      window.setOpacity(opacity)
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Copy Translated Image',
      click: () => clipboard.writeImage(image),
    },
  ]
  if (targetText) {
    template.push({
      label: 'Copy Translation',
      click: () => clipboard.writeText(targetText),
    })
  }
  if (sourceText) {
    template.push({
      label: 'Copy Source Text',
      click: () => clipboard.writeText(sourceText),
    })
  }
  template.push(
    { type: 'separator' },
    { label: 'Zoom In', click: () => stepZoom(1) },
    { label: 'Zoom Out', click: () => stepZoom(-1) },
    { label: 'Reset Zoom', click: resetZoom },
    {
      label: 'Opacity',
      enabled: platform !== 'linux',

      submenu: PIN_OPACITY_OPTIONS.map(
        (option, index): MenuItemConstructorOptions => ({
          label: option.label,
          type: 'radio',
          checked: index === 0,
          click: () => applyOpacity(option.value),
        }),
      ),
    },
    { type: 'separator' },
    { label: 'Close', click: closeWindow },
  )
  const menu = Menu.buildFromTemplate(template)

  window.webContents.on('context-menu', (event) => {
    event.preventDefault()
    menu.popup({ window })
  })
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      event.preventDefault()
      closeWindow()
      return
    }
    if (input.shift && (input.control || input.meta) && input.key.toLowerCase() === 'c') {
      event.preventDefault()
      if (targetText)
        clipboard.writeText(targetText)
      else clipboard.writeImage(image)
      return
    }

    if (!(input.control || input.meta) || input.alt)
      return
    const key = input.key.toLowerCase()
    if (key === '+' || key === '=' || key === 'add') {
      event.preventDefault()
      stepZoom(1)
    }
    else if (key === '-' || key === 'subtract') {
      event.preventDefault()
      stepZoom(-1)
    }
    else if (key === '0') {
      event.preventDefault()
      resetZoom()
    }
  })
}

export async function openImageTranslatePinWindow(
  payload: ImageTranslatePinWindowPayload,
): Promise<BrowserWindow> {
  const image = nativeImage.createFromBuffer(Buffer.from(payload.translatedImageBase64, 'base64'))
  const { x, y, width, height } = resolveWindowBounds(image)
  const touchWindow = new TouchWindow({
    x,
    y,
    width,
    height,
    minWidth: MIN_PIN_WIDTH,
    minHeight: MIN_PIN_HEIGHT,
    show: false,
    frame: true,
    title: 'Image Translation',
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  touchWindow.window.setAlwaysOnTop(true, 'floating')
  touchWindow.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  registerPinWindowActions(touchWindow.window, image, payload)
  await touchWindow.window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(payload))}`,
  )
  touchWindow.window.show()
  return touchWindow.window
}
