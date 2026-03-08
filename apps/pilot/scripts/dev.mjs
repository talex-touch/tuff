import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'

const basePort = Number(process.env.PILOT_DEV_PORT || 3300)
const range = Number(process.env.PILOT_DEV_PORT_RANGE || 20)
const host = String(process.env.HOST || '127.0.0.1')

if (!process.env.NUXT_USE_CLOUDFLARE_DEV)
  process.env.NUXT_USE_CLOUDFLARE_DEV = 'true'
if (!process.env.CLOUDFLARE_DEV_ENVIRONMENT)
  process.env.CLOUDFLARE_DEV_ENVIRONMENT = 'preview'

function checkPort(targetPort) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({ port: targetPort, host }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function resolvePort() {
  for (let offset = 0; offset < range; offset += 1) {
    const port = basePort + offset
    if (await checkPort(port))
      return port
  }
  throw new Error(`[pilot] No available port from ${basePort} to ${basePort + range - 1}`)
}

const port = await resolvePort()
process.env.PORT = String(port)

const pnpmExecPath = process.env.npm_execpath || 'pnpm'
const child = spawn(pnpmExecPath, ['exec', 'nuxt', 'dev', '--port', String(port)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
