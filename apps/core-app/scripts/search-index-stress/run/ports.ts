import net from 'node:net'

const HOST = '127.0.0.1'

function listenOnFreePort(): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => resolve(server))
  })
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

/**
 * Binds :0 `count` times at once and releases afterwards, so the returned ports are distinct from
 * each other; `avoid` ports (the dev vite default, the stock inspector port) are never returned.
 */
export async function allocatePorts(
  count: number,
  avoid: readonly number[] = []
): Promise<number[]> {
  const held: net.Server[] = []
  const ports: number[] = []
  try {
    while (ports.length < count) {
      const server = await listenOnFreePort()
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      if (!port || avoid.includes(port)) {
        await closeServer(server)
        continue
      }
      held.push(server)
      ports.push(port)
    }
  } finally {
    await Promise.all(held.map(closeServer))
  }
  return ports
}

export interface AppPorts {
  cdp: number
  inspect: number
  vite: number
}

export async function allocateAppPorts(): Promise<AppPorts> {
  const [cdp, inspect, vite] = await allocatePorts(3, [5173, 9229, 9222])
  return { cdp, inspect, vite }
}
