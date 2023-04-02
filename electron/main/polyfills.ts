import { nowTime } from '../utils/common-util'

const originalConsoleLog = console.log;

// define a new output
console.log = function(...args) {

    originalConsoleLog(`[${nowTime()}]`, "[INFO]", ...args)

}