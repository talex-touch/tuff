const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app, BrowserWindow, session } = require('electron')

const PARTITION = 'tuff-plugin-view-smoke'
const REMOTE_NAVIGATION_URL = 'https://example.invalid/navigation'
const REMOTE_POPUP_URL = 'https://example.invalid/popup'
const REMOTE_RESOURCE_URL = 'https://example.invalid/resource'

const bootstrap = {
  channelKey: 'plugin-view-smoke-key',
  plugin: {
    name: 'plugin-view-smoke',
    version: '1.0.0',
    sdkapi: 260615
  },
  config: {
    themeStyle: { dark: true }
  }
}

function buildBootstrapArgument() {
  return `--tuff-plugin-view-bootstrap=${encodeURIComponent(JSON.stringify(bootstrap))}`
}

function installSecurityPolicy(window, entryUrl) {
  const evidence = {
    blockedNavigations: [],
    blockedPopups: [],
    blockedResources: [],
    permissionChecks: 0,
    permissionRequests: 0
  }
  const { webContents } = window

  webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl.split('#', 1)[0] === entryUrl) return
    evidence.blockedNavigations.push(targetUrl)
    event.preventDefault()
  })
  webContents.setWindowOpenHandler(({ url }) => {
    evidence.blockedPopups.push(url)
    return { action: 'deny' }
  })
  webContents.session.setPermissionCheckHandler((requestingWebContents) => {
    if (requestingWebContents?.id === webContents.id) evidence.permissionChecks += 1
    return false
  })
  webContents.session.setPermissionRequestHandler(
    (requestingWebContents, _permission, callback) => {
      if (requestingWebContents?.id === webContents.id) evidence.permissionRequests += 1
      callback(false)
    }
  )
  webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const allowed =
      details.url.split('#', 1)[0] === entryUrl ||
      details.url === REMOTE_NAVIGATION_URL ||
      details.url.startsWith('data:')
    if (!allowed) evidence.blockedResources.push(details.url)
    callback({ cancel: !allowed })
  })

  return evidence
}

async function waitForEvidence(predicate, description) {
  const deadline = Date.now() + 2_000
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function run() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-view-preload-smoke-'))
  const htmlPath = path.join(tempDir, 'index.html')
  await fs.writeFile(htmlPath, '<!doctype html><html><body></body></html>', 'utf-8')

  const preloadPath = path.resolve(__dirname, '..', 'out', 'preload', 'plugin-view.js')
  const entryUrl = pathToFileURL(htmlPath).href
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: preloadPath,
      additionalArguments: [buildBootstrapArgument()],
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false
    }
  })
  const policyEvidence = installSecurityPolicy(window, entryUrl)
  let failure

  try {
    await window.loadFile(htmlPath)
    const rendererResult = await window.webContents.executeJavaScript(`(async () => {
      const dispose = window.$channel.regChannel('smoke:event', () => undefined)
      const snapshot = {
        plugin: window.$plugin,
        config: window.$config,
        channel: {
          send: typeof window.$channel.send,
          regChannel: typeof window.$channel.regChannel,
          unRegChannel: typeof window.$channel.unRegChannel,
          disposer: typeof dispose,
          destroy: typeof window.$channel.destroy,
          sendSync: typeof window.$channel.sendSync
        },
        globals: {
          require: typeof window.require,
          process: typeof window.process,
          ipcRenderer: typeof window.ipcRenderer,
          electron: typeof window.electron
        },
        dark: document.documentElement.classList.contains('dark'),
        security: {
          popupDenied: window.open(${JSON.stringify(REMOTE_POPUP_URL)}) === null,
          resourceDenied: await fetch(${JSON.stringify(REMOTE_RESOURCE_URL)}).then(
            () => false,
            () => true
          ),
          notificationPermission: await Notification.requestPermission()
        }
      }
      dispose()
      setTimeout(() => {
        location.href = ${JSON.stringify(REMOTE_NAVIGATION_URL)}
      }, 0)
      return snapshot
    })()`)

    await waitForEvidence(
      () => policyEvidence.blockedNavigations.includes(REMOTE_NAVIGATION_URL),
      'remote navigation denial'
    )
    await waitForEvidence(
      () => policyEvidence.blockedResources.includes(REMOTE_RESOURCE_URL),
      'remote resource denial'
    )
    await waitForEvidence(
      () => policyEvidence.permissionChecks + policyEvidence.permissionRequests > 0,
      'permission denial'
    )

    const webPreferences = window.webContents.getLastWebPreferences()
    const result = {
      ...rendererResult,
      preferences: {
        nodeIntegration: webPreferences.nodeIntegration,
        nodeIntegrationInSubFrames: webPreferences.nodeIntegrationInSubFrames,
        contextIsolation: webPreferences.contextIsolation,
        sandbox: webPreferences.sandbox,
        webSecurity: webPreferences.webSecurity,
        webviewTag: webPreferences.webviewTag,
        isolatedSession: window.webContents.session === session.fromPartition(PARTITION)
      },
      policy: {
        navigationDenied: policyEvidence.blockedNavigations.includes(REMOTE_NAVIGATION_URL),
        popupDenied:
          rendererResult.security.popupDenied &&
          policyEvidence.blockedPopups.includes(REMOTE_POPUP_URL),
        resourceDenied:
          rendererResult.security.resourceDenied &&
          policyEvidence.blockedResources.includes(REMOTE_RESOURCE_URL),
        permissionDenied:
          rendererResult.security.notificationPermission === 'denied' &&
          policyEvidence.permissionChecks + policyEvidence.permissionRequests > 0
      }
    }

    const expected = {
      plugin: bootstrap.plugin,
      config: bootstrap.config,
      channel: {
        send: 'function',
        regChannel: 'function',
        unRegChannel: 'function',
        disposer: 'function',
        destroy: 'undefined',
        sendSync: 'undefined'
      },
      globals: {
        require: 'undefined',
        process: 'undefined',
        ipcRenderer: 'undefined',
        electron: 'undefined'
      },
      dark: true,
      security: {
        popupDenied: true,
        resourceDenied: true,
        notificationPermission: 'denied'
      },
      preferences: {
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        isolatedSession: true
      },
      policy: {
        navigationDenied: true,
        popupDenied: true,
        resourceDenied: true,
        permissionDenied: true
      }
    }

    if (JSON.stringify(result) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected plugin view bridge snapshot: ${JSON.stringify(result)}`)
    }

    fsSync.writeSync(process.stdout.fd, `${JSON.stringify(result)}\n`)
  } catch (error) {
    failure = error
    process.exitCode = 1
    fsSync.writeSync(process.stderr.fd, `${error instanceof Error ? error.stack : String(error)}\n`)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }

  if (failure) {
    app.exit(1)
    return
  }

  window.destroy()
}

app.commandLine.appendSwitch('disable-gpu')
app
  .whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    fsSync.writeSync(process.stderr.fd, `${error instanceof Error ? error.stack : String(error)}\n`)
    app.exit(1)
  })
