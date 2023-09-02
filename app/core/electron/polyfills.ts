import path from "node:path";
import {app, BrowserWindow} from "electron";

process.env.DIST = path.join(__dirname, '../dist')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

// process.on('uncaughtException', (error, origin) => {
//     console.error("[TalexTouch-ErrorUncaught]", error, origin)
// })

// process.on('unhandledRejection', (reason, promise) => {
//     console.error("[TalexTouch-ErrorUnhandled]", reason, promise)
// })

// Remove electron security warnings
// This warning only shows adopters development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
process.env['trace-warnings'] = 'true'
process.env['unhandledrejections'] = 'strict'