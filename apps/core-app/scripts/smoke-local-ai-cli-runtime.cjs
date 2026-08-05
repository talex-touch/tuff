const { createRequire } = require('node:module')

const runtimeRoot = process.env.LOCAL_AI_CLI_RUNTIME_ROOT
const runtimeRequire = runtimeRoot
  ? createRequire(`${runtimeRoot.replace(/\/$/, '')}/runtime-smoke.cjs`)
  : require
const nodePty = runtimeRequire('node-pty')
const { promise, resolve, reject } = Promise.withResolvers()
const terminal = nodePty.spawn('/bin/cat', [], {
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env
})
const timeout = setTimeout(() => {
  terminal.kill()
  reject(new Error('node-pty smoke timed out'))
}, 5000)
let output = ''
terminal.onData((chunk) => {
  output += chunk
  if (!output.includes('LOCAL_AI_CLI_PTY_OK')) return
  terminal.resize(100, 30)
  terminal.kill()
})
terminal.onExit(() => {
  clearTimeout(timeout)
  if (output.includes('LOCAL_AI_CLI_PTY_OK')) resolve()
  else reject(new Error('node-pty smoke did not echo input'))
})
terminal.write('LOCAL_AI_CLI_PTY_OK\r')

promise
  .then(() => {
    process.stdout.write('LOCAL_AI_CLI_PTY_SMOKE_OK\n')
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
