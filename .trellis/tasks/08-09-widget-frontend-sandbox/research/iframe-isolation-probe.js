const { app, BrowserWindow } = require('electron')
const mode = process.argv[process.argv.length - 1]
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: true, width: 360, height: 240,
    webPreferences: { sandbox: true, backgroundThrottling: false } })
  await w.loadFile('/tmp/iframe-probe/page3.html', { search: `mode=${mode}` })
  const started = Date.now()
  let done = false
  while (!done && Date.now() - started < 25000) {
    await new Promise((r) => setTimeout(r, 250))
    try { done = (await w.webContents.executeJavaScript('window.__phase')) === 'done' } catch {}
  }
  const during = done ? await w.webContents.executeJavaScript('window.__during') : -1
  const ran = done ? await w.webContents.executeJavaScript('window.__ran') : false
  console.log(`PROBE|mode=${mode}|ticks=${during}|loopRan=${ran}|parent=${during > 40 ? 'ALIVE' : 'BLOCKED'}`)
  app.exit(0)
})
