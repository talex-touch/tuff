// import { nowTime } from './utils/common-util'

// const originalConsoleLog = console.log;

// define a new output
// console.log = function(...args) {

//     originalConsoleLog(`[${nowTime()}]`, "[INFO]", ...args)

// }

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