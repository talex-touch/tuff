import type { StartupInfo } from '../shared/types/startup-info'
import type { LoadingEvent, LoadingMode, PreloadAPI } from '@talex-touch/utils/preload'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronAPI } from '@electron-toolkit/preload'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import {

  PRELOAD_LOADING_CHANNEL,

} from '@talex-touch/utils/preload'
import { isCoreBox, isDivisionBox, isMainWindow, useInitialize, useArgMapper } from '@talex-touch/utils/renderer'
// import appIconAsset from '../../public/favicon.ico?asset'
import { contextBridge, ipcRenderer } from 'electron'

declare global {
  interface Window {
    $startupInfo?: StartupInfo
    /** DivisionBox mode flag - set by preload based on command line args */
    $isDivisionBox?: boolean
  }
}
import appLogoAsset from '../../public/logo.png?asset'

function resolveAssetSource(asset: string): string {
  if (!asset)
    return asset

  if (/^(?:https?:\/\/|file:|data:)/.test(asset)) {
    return asset
  }

  if (path.isAbsolute(asset)) {
    return pathToFileURL(asset).toString()
  }

  if (asset.startsWith('/')) {
    if (window.location.protocol === 'file:') {
      const publicDir = process.env.PUBLIC
      if (publicDir) {
        return pathToFileURL(path.join(publicDir, asset.slice(1))).toString()
      }
      return `file://${asset}`
    }

    return asset
  }

  if (window.location.protocol === 'file:') {
    const publicDir = process.env.PUBLIC
    if (publicDir) {
      return pathToFileURL(path.join(publicDir, asset)).toString()
    }
  }

  return asset
}

interface StartupHandshakePayload {
  rendererStartTime: number
}

/**
 * Request startup information from the main process before the renderer runs.
 */
function requestStartupInfo(): StartupInfo | undefined {
  try {
    const response = ipcRenderer.sendSync('@main-process-message', {
      code: DataCode.SUCCESS,
      data: { rendererStartTime: performance.timeOrigin } satisfies StartupHandshakePayload,
      name: 'app-ready',
      header: {
        status: 'request',
        type: ChannelType.MAIN,
      },
    })

    if (response?.header?.status === 'reply' && response.data) {
      return response.data as StartupInfo
    }
  }
  catch (error) {
    console.warn('[preload] Failed to request startup info', error)
  }

  return undefined
}

const appLogo = resolveAssetSource(appLogoAsset)
// const appIcon = resolveAssetSource(appIconAsset)
const startupInfo = requestStartupInfo()
if (startupInfo && typeof startupInfo.appUpdate === 'undefined') {
  startupInfo.appUpdate = false
}

const isDebugMode = Boolean(process.env.DEBUG) || location.search.includes('debug-preload')

const api: PreloadAPI = {
  /**
   * Update loading overlay from renderer when needed.
   */
  sendPreloadEvent(event: LoadingEvent) {
    window.postMessage({ channel: PRELOAD_LOADING_CHANNEL, data: event }, '*')
  },
} satisfies PreloadAPI

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    if (startupInfo) {
      contextBridge.exposeInMainWorld('$startupInfo', startupInfo)
    }
  }
  catch (error) {
    console.error(error)
  }
}
else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  if (startupInfo) {
    window.$startupInfo = startupInfo
  }
}

// Set DivisionBox flag in preload (before renderer initialization)
if (isDivisionBox()) {
  window.$isDivisionBox = true
  console.log('[preload] DivisionBox mode detected')
}

function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']): Promise<boolean> {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    }
    else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      parent.removeChild(child)
    }
  },
}

interface LoadingOptions {
  mode: LoadingMode
}

interface DebugInfo {
  message: string
  timestamp: number
}

const FINALIZE_PROGRESS_VALUE = 1
const FINALIZE_PROGRESS_HOLD_MS = 360
const FADE_OUT_DURATION_MS = 420

type CleanupHandle = () => void

function useLoading(options: LoadingOptions) {
  const className = `AppLoading`

  const styleContent = `
.${className} {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(28px, 5vw, 44px);
  width: 100vw;
  height: 100vh;
  --app-loading-background: radial-gradient(circle at top, #2c2c34 0%, #18181c 55%, #101014 100%);
  --app-loading-foreground: #f5f5f5;
  background: var(--app-loading-background);
  color: var(--app-loading-foreground);
  z-index: 2147483000;
  font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.42s ease, visibility 0.42s ease;
}
.${className}[data-status='active'],
.${className}[data-status='ready'],
.${className}[data-status='completing'] {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
.${className}[data-status='hidden'] {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
.${className}[data-theme='light'] {
  --app-loading-background: radial-gradient(circle at top, #f5f7ff 0%, #e2e5f2 55%, #d5d8e3 100%);
  --app-loading-foreground: #13151a;
}
.${className}__brand {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(168px, 23vw, 220px);
  height: clamp(168px, 23vw, 220px);
}
.${className}__brand-logo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 0 30px rgba(117, 245, 255, 0.22));
  animation: ${className}__brand-logo__animation 2.8s infinite cubic-bezier(0.22, 1, 0.36, 1);
}
.${className}__progress {
  width: min(320px, 80vw);
  height: 8px;
  border-radius: 999px;
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}
.${className}__progress::before {
  content: '';
  position: absolute;
  inset: 0;
  transform-origin: left center;
  background: linear-gradient(90deg, #8c66ff 0%, #5b8dff 50%, #75f5ff 100%);
  filter: drop-shadow(0 0 18px rgba(117, 245, 255, 0.35));
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  transform: scaleX(var(--app-loading-progress, 0.08));
}
.${className}[data-theme='light'] .${className}__progress {
  background: rgba(19, 21, 26, 0.12);
}
.${className}[data-theme='light'] .${className}__progress::before {
  filter: drop-shadow(0 0 18px rgba(92, 141, 255, 0.24));
}
.${className}__bar {
  width: min(320px, 80vw);
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  position: relative;
  background: rgba(255, 255, 255, 0.08);
}
.${className}[data-theme='light'] .${className}__bar {
  background: rgba(19, 21, 26, 0.12);
}
.${className}__bar::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%);
  transform: translateX(-100%);
  animation: ${className}__bar__animation 1.2s infinite;
}
.${className}[data-theme='light'] .${className}__bar::before {
  background: linear-gradient(90deg, rgba(19,21,26,0) 0%, rgba(19,21,26,0.28) 50%, rgba(19,21,26,0) 100%);
}
.${className}__debug {
  width: min(360px, 86vw);
  max-height: 160px;
  padding: 16px 18px;
  background: rgba(24, 28, 32, 0.82);
  border: 1px solid rgba(140, 102, 255, 0.25);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  border-radius: 14px;
  backdrop-filter: blur(18px);
  font-size: 12px;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}
.${className}__debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: rgba(255, 255, 255, 0.64);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.${className}__debug-body {
  color: rgba(255, 255, 255, 0.82);
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(117, 245, 255, 0.35) rgba(255, 255, 255, 0.1);
}
.${className}__debug-body::-webkit-scrollbar {
  width: 6px;
}
.${className}__debug-body::-webkit-scrollbar-thumb {
  background: rgba(117, 245, 255, 0.35);
  border-radius: 999px;
}
.${className}__message {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.76);
  letter-spacing: 0.02em;
}
.${className}[data-theme='light'] .${className}__message {
  color: rgba(19, 21, 26, 0.72);
}

@keyframes ${className}__brand-logo__animation {
  0%, 100% {
    filter: hue-rotate(0deg) drop-shadow(0 0 24px rgba(117, 245, 255, 0.25));
    transform: scale(1);
  }
  50% {
    filter: hue-rotate(-25deg) drop-shadow(0 0 36px rgba(92, 141, 255, 0.35));
    transform: scale(1.06) rotate(3deg);
  }
}

@keyframes ${className}__bar__animation {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(100%);
  }
}
    `

  const oStyle = document.createElement('style')
  oStyle.id = `${className}__styles`
  oStyle.innerHTML = styleContent

  const container = document.createElement('div')
  container.className = className
  container.innerHTML = `
    <div class="${className}__brand" aria-hidden="true">
      <img class="${className}__brand-logo" src="${appLogo}" alt="" />
    </div>
    <div class="${className}__progress" role="progressbar"></div>
    <div class="${className}__message">Initializing Talex Touch...</div>
  `

  const progressBar = container.querySelector(`.${className}__progress`) as HTMLElement
  const messageEl = container.querySelector(`.${className}__message`) as HTMLElement

  let currentMode: LoadingMode = options.mode

  let progressValue = 0.06
  let rafId: number | null = null
  let progressLoop = true
  let debugList: DebugInfo[] = []
  let removalRequested = false
  let rendererFinished = false
  let windowLoaded = document.readyState === 'complete'
  let isRemoving = false
  let removalCompleted = false
  let finalizeTimer: number | null = null
  let fadeTimer: number | null = null
  let transitionCleanup: CleanupHandle | null = null
  let removeColorSchemeListener: CleanupHandle | null = null

  const updateProgress = (value: number, force = false) => {
    const upperBound = force ? 1 : 0.97
    progressValue = Math.max(0.05, Math.min(value, upperBound))
    progressBar?.style.setProperty('--app-loading-progress', progressValue.toFixed(3))
  }

  const simulateProgress = () => {
    if (!progressLoop)
      return
    const delta = Math.random() * 0.035 + 0.01
    updateProgress(progressValue + delta)
    rafId = window.setTimeout(simulateProgress, 700 + Math.random() * 900)
  }

  const startSimulation = () => {
    stopSimulation()
    progressLoop = true
    simulateProgress()
  }

  const stopSimulation = () => {
    progressLoop = false
    if (rafId) {
      window.clearTimeout(rafId)
      rafId = null
    }
  }

  const clearFinalizeTimer = () => {
    if (finalizeTimer) {
      window.clearTimeout(finalizeTimer)
      finalizeTimer = null
    }
  }

  const clearFadeTimer = () => {
    if (fadeTimer) {
      window.clearTimeout(fadeTimer)
      fadeTimer = null
    }
  }

  const clearTransitionCleanup = () => {
    if (transitionCleanup) {
      transitionCleanup()
      transitionCleanup = null
    }
  }

  const clearColorSchemeListener = () => {
    if (removeColorSchemeListener) {
      removeColorSchemeListener()
      removeColorSchemeListener = null
    }
  }

  const setupColorSchemeWatcher = () => {
    clearColorSchemeListener()
    if (typeof window.matchMedia !== 'function') {
      container.dataset.theme = 'dark'
      return
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = (matches: boolean) => {
      container.dataset.theme = matches ? 'dark' : 'light'
    }
    applyTheme(query.matches)
    const handleChange = (event: MediaQueryListEvent) => {
      applyTheme(event.matches)
    }
    query.addEventListener('change', handleChange)
    removeColorSchemeListener = () => query.removeEventListener('change', handleChange)
  }

  const cleanupOverlay = () => {
    if (removalCompleted)
      return
    removalCompleted = true
    clearFinalizeTimer()
    clearFadeTimer()
    clearTransitionCleanup()
    clearColorSchemeListener()
    window.removeEventListener('message', messageListener)
    safeDOM.remove(document.head, oStyle)
    safeDOM.remove(document.body, container)
  }

  const scheduleFadeOut = () => {
    clearTransitionCleanup()
    container.dataset.status = 'hidden'

    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== container || event.propertyName !== 'opacity')
        return
      container.removeEventListener('transitionend', handleTransitionEnd)
      transitionCleanup = null
      cleanupOverlay()
    }

    transitionCleanup = () => container.removeEventListener('transitionend', handleTransitionEnd)
    container.addEventListener('transitionend', handleTransitionEnd)

    clearFadeTimer()
    fadeTimer = window.setTimeout(() => {
      cleanupOverlay()
    }, FADE_OUT_DURATION_MS + 80)
  }

  const startRemovalSequence = () => {
    if (isRemoving || removalCompleted)
      return

    isRemoving = true
    container.dataset.status = 'completing'
    stopSimulation()
    window.removeEventListener('message', messageListener)
    updateProgress(FINALIZE_PROGRESS_VALUE, true)

    clearFinalizeTimer()
    finalizeTimer = window.setTimeout(() => {
      scheduleFadeOut()
    }, FINALIZE_PROGRESS_HOLD_MS)
  }

  const attemptFinalize = () => {
    if (isRemoving || removalCompleted)
      return
    if (!removalRequested || !windowLoaded || !rendererFinished)
      return
    startRemovalSequence()
  }

  const ensureDebugPanel = () => {
    const existing = container.querySelector(`.${className}__debug`)
    if (existing)
      return existing

    const wrapper = document.createElement('div')
    wrapper.className = `${className}__debug`
    wrapper.innerHTML = `
      <div class="${className}__debug-header">
        <span>Debug Startup Logs</span>
        <span>${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="${className}__debug-body" aria-live="polite"></div>
    `

    container.appendChild(wrapper)
    return wrapper
  }

  const renderDebugMessages = () => {
    const debugWrapper = ensureDebugPanel()
    const body = debugWrapper.querySelector(`.${className}__debug-body`)
    if (!body)
      return

    body.innerHTML = debugList
      .slice(-12)
      .map((item) => {
        return `<div>[${new Date(item.timestamp).toLocaleTimeString()}] ${item.message}</div>`
      }) // logs kept short
      .join('')
    body.scrollTop = body.scrollHeight
  }

  const handleEvent = (event: LoadingEvent) => {
    switch (event.type) {
      case 'mode':
        currentMode = event.mode
        container.dataset.mode = event.mode
        if (event.mode === 'progress') {
          progressBar.className = `${className}__progress`
        }
        else {
          progressBar.className = `${className}__bar`
        }
        if (event.mode === 'debug') {
          ensureDebugPanel()
        }
        break
      case 'message':
        messageEl.textContent = event.message
        if (currentMode === 'debug') {
          handleDebugMessage(event.message)
        }
        break
      case 'progress':
        if (typeof event.delta === 'number') {
          updateProgress(progressValue + event.delta)
        }
        else if (event.reset) {
          updateProgress(0.05)
        }
        break
      case 'state':
        if (event.state === 'start') {
          startSimulation()
          container.dataset.status = 'active'
        }
        if (event.state === 'finish') {
          rendererFinished = true
          container.dataset.status = 'ready'
          stopSimulation()
          updateProgress(FINALIZE_PROGRESS_VALUE, true)
          attemptFinalize()
        }
        break
    }
  }

  const handleDebugMessage = (message: string) => {
    debugList = [...debugList, { message, timestamp: Date.now() }]
    renderDebugMessages()
  }

  const messageListener = (ev: MessageEvent) => {
    if (ev.data?.channel !== PRELOAD_LOADING_CHANNEL)
      return
    const payload = ev.data.data as LoadingEvent | undefined
    if (!payload)
      return

    handleEvent(payload)
  }

  return {
    appendLoading() {
      setupColorSchemeWatcher()
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, container)
      container.dataset.mode = options.mode
      container.dataset.status = 'active'
      currentMode = options.mode

      if (options.mode === 'debug') {
        ensureDebugPanel()
      }

      if (!isRemoving && !removalCompleted) {
        startSimulation()
        window.addEventListener('message', messageListener)
      }

      if (windowLoaded && removalRequested && rendererFinished) {
        attemptFinalize()
      }
    },
    removeLoading() {
      if (removalCompleted)
        return
      removalRequested = true

      if (!rendererFinished) {
        rendererFinished = true
        stopSimulation()
        updateProgress(FINALIZE_PROGRESS_VALUE, true)
      }

      attemptFinalize()
    },
    showDebugMessage(message: string) {
      handleDebugMessage(message)
    },
    setMode(mode: LoadingMode) {
      currentMode = mode
      container.dataset.mode = mode
      if (mode === 'debug') {
        ensureDebugPanel()
      }
    },
    handleEvent,
    updateMessage(message: string) {
      messageEl.textContent = message
    },
    markWindowLoaded() {
      windowLoaded = true
      if (!removalRequested) {
        removalRequested = true
      }
      if (!rendererFinished) {
        rendererFinished = true
      }
      if (!isRemoving && !removalCompleted) {
        container.dataset.status = 'ready'
        updateProgress(FINALIZE_PROGRESS_VALUE, true)
      }
      attemptFinalize()
    },
  }
}

const detectedMode: LoadingMode = isDebugMode ? 'debug' : 'progress'

const { appendLoading, removeLoading, handleEvent, updateMessage, markWindowLoaded } = useLoading({
  mode: detectedMode,
})

domReady().then(() => {
  const info = useInitialize()
  
  // Debug: log window type detection
  const argMapper = useArgMapper()
  console.log('[preload] process.argv:', process.argv)
  console.log('[preload] argMapper:', argMapper)
  console.log('[preload] touchType:', argMapper.touchType)
  console.log('[preload] isMainWindow:', isMainWindow())
  console.log('[preload] isCoreBox:', isCoreBox())
  
  if (isMainWindow()) {
    appendLoading()
  }
  else if (isCoreBox()) {
    document.body.classList.add('core-box')
  }

  document.body.classList.add(info.platform)
})

window.onmessage = (ev) => {
  if (!ev.data)
    return
  if (ev.data.payload === 'removeLoading') {
    removeLoading()
    return
  }
  if (ev.data.channel === PRELOAD_LOADING_CHANNEL) {
    handleEvent(ev.data.data as LoadingEvent)
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateMessage('Renderer initializing modules...')
})

window.addEventListener('load', () => {
  markWindowLoaded()
})
