/**
 * Counts what the code under test has on the wire so a manual clock never moves while real I/O it
 * started is still in transit: requests sent and not yet answered, sockets still connecting and
 * fetches whose body has not been read. Loopback delivery on macOS can take longer than any fixed
 * number of event-loop turns, which would otherwise show up as a request "unanswered" for a step.
 */
export interface NetGauge {
  inflight(): number
  uninstall(): void
}

const JSON_RPC = /^\{"id":\d+/

export function installNetGauge(): NetGauge {
  const RealWebSocket = globalThis.WebSocket
  const realFetch = globalThis.fetch
  const live = new Set<{ outstanding: number }>()
  let connecting = 0
  let fetching = 0

  class GaugedWebSocket extends RealWebSocket {
    private readonly gauge = { outstanding: 0 }

    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      const { gauge } = this
      let connected = false
      const connectDone = (): void => {
        if (connected) return
        connected = true
        connecting--
      }
      connecting++
      this.addEventListener('open', () => {
        connectDone()
        live.add(gauge)
      })
      this.addEventListener('error', connectDone)
      this.addEventListener('close', () => {
        connectDone()
        live.delete(gauge)
      })
      this.addEventListener('message', (event) => {
        if (typeof event.data === 'string' && JSON_RPC.test(event.data)) gauge.outstanding--
      })
    }

    override send(data: Parameters<WebSocket['send']>[0]): void {
      if (typeof data === 'string' && JSON_RPC.test(data)) this.gauge.outstanding++
      super.send(data)
    }
  }

  const gaugedFetch: typeof fetch = async (input, init) => {
    fetching++
    let response: Response
    try {
      response = await realFetch(input, init)
    } catch (error) {
      fetching--
      throw error
    }
    if (!response.ok) {
      fetching--
      return response
    }
    const json = response.json.bind(response)
    Object.defineProperty(response, 'json', {
      value: async () => {
        try {
          return await json()
        } finally {
          fetching--
        }
      }
    })
    return response
  }

  globalThis.WebSocket = GaugedWebSocket as unknown as typeof WebSocket
  globalThis.fetch = gaugedFetch

  return {
    inflight() {
      let outstanding = 0
      for (const socket of live) outstanding += socket.outstanding
      return connecting + fetching + outstanding
    },
    uninstall() {
      globalThis.WebSocket = RealWebSocket
      globalThis.fetch = realFetch
    }
  }
}
