import type { ToolGatewayHandle } from './gateway-server'
import type { ToolDefinition } from './tool-registry'
import { Buffer } from 'node:buffer'
import { request as httpRequest } from 'node:http'
import { CHART_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startToolGateway } from './gateway-server'
import { createToolRegistry, parseChartSpec, resolveUserPath } from './tool-registry'

let handle: ToolGatewayHandle | null = null

afterEach(async () => {
  await handle?.close()
  handle = null
})

function echoTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'echo',
    risk: 'read',
    summarize: (args) => `echo ${String(args.value ?? '')}`,
    execute: async (args) => ({ output: String(args.value ?? ''), isError: false }),
    ...overrides
  }
}

/**
 * Raw `node:http` rather than fetch: this exercises the wire contract the pi
 * extension actually speaks, and the app bans direct fetch in favour of its
 * network SDK — which has no business proxying a loopback test.
 */
function call(
  url: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; text: string }> {
  const target = new URL(url)
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: options.method ?? 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') })
        )
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function invoke(
  gateway: ToolGatewayHandle,
  body: unknown,
  token = gateway.token
): Promise<{ status: number; json: any }> {
  const response = await call(gateway.url, { token, body })
  return {
    status: response.status,
    json: response.text ? JSON.parse(response.text) : null
  }
}

describe('tool gateway', () => {
  it('runs an approved tool and echoes its result', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: false }))
    handle = await startToolGateway({ tools: new Map([['echo', echoTool()]]), confirm })

    const { status, json } = await invoke(handle, { tool: 'echo', args: { value: 'hi' } })
    expect(status).toBe(200)
    expect(json).toEqual({ output: 'hi', isError: false })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ tool: 'echo', risk: 'read' }))
  })

  it('rejects a wrong or missing token before doing anything', async () => {
    const execute = vi.fn(async () => ({ output: 'ran', isError: false }))
    const confirm = vi.fn(async () => ({ approved: true, remember: false }))
    handle = await startToolGateway({ tools: new Map([['echo', echoTool({ execute })]]), confirm })

    const bad = await invoke(handle, { tool: 'echo', args: {} }, 'not-the-token')
    expect(bad.status).toBe(401)
    expect(execute).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('answers a denial to the model instead of failing the request', async () => {
    const execute = vi.fn(async () => ({ output: 'ran', isError: false }))
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool({ execute })]]),
      confirm: async () => ({ approved: false, remember: false })
    })

    const { status, json } = await invoke(handle, { tool: 'echo', args: {} })
    expect(status).toBe(200)
    expect(json.isError).toBe(true)
    expect(json.output).toContain('denied')
    expect(execute).not.toHaveBeenCalled()
  })

  it('remembers read-risk approvals but re-asks for execute-risk ones', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: true }))
    handle = await startToolGateway({
      tools: new Map<string, ToolDefinition>([
        ['echo', echoTool()],
        ['danger', echoTool({ name: 'danger', risk: 'execute' })]
      ]),
      confirm
    })

    await invoke(handle, { tool: 'echo', args: { value: '1' } })
    await invoke(handle, { tool: 'echo', args: { value: '2' } })
    expect(confirm).toHaveBeenCalledTimes(1)

    await invoke(handle, { tool: 'danger', args: {} })
    await invoke(handle, { tool: 'danger', args: {} })
    // Two more prompts: a remembered yes never becomes a standing grant here.
    expect(confirm).toHaveBeenCalledTimes(3)
  })

  it('drops remembered approvals on reset', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: true }))
    handle = await startToolGateway({ tools: new Map([['echo', echoTool()]]), confirm })

    await invoke(handle, { tool: 'echo', args: {} })
    handle.resetSessionApprovals()
    await invoke(handle, { tool: 'echo', args: {} })
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('reports an unknown tool back to the model', async () => {
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm: async () => ({ approved: true, remember: false })
    })

    const { status, json } = await invoke(handle, { tool: 'nope', args: {} })
    expect(status).toBe(200)
    expect(json).toMatchObject({ isError: true })
    expect(json.output).toContain('Unknown tool')
  })

  it('turns a throwing tool into an error result, not a dead request', async () => {
    handle = await startToolGateway({
      tools: new Map([
        [
          'echo',
          echoTool({
            execute: async () => {
              throw new Error('boom')
            }
          })
        ]
      ]),
      confirm: async () => ({ approved: true, remember: false })
    })

    const { status, json } = await invoke(handle, { tool: 'echo', args: {} })
    expect(status).toBe(200)
    expect(json).toMatchObject({ isError: true })
    expect(json.output).toContain('boom')
  })

  it('serves nothing but POST /invoke', async () => {
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm: async () => ({ approved: true, remember: false })
    })

    const response = await call(handle.url, { method: 'GET', token: handle.token })
    expect(response.status).toBe(404)
  })

  it('binds loopback only', async () => {
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm: async () => ({ approved: true, remember: false })
    })
    expect(handle.url.startsWith('http://127.0.0.1:')).toBe(true)
  })
})

describe('tool registry', () => {
  const registry = createToolRegistry({
    searchFiles: async () => [{ name: 'a.txt', path: '/tmp/a.txt' }],
    openPath: async () => ''
  })

  it('classifies risk so only reads are rememberable', () => {
    expect(registry.get('tuff_search_files')?.risk).toBe('read')
    expect(registry.get('tuff_read_file')?.risk).toBe('read')
    expect(registry.get('tuff_open_path')?.risk).toBe('execute')
  })

  it('refuses binaries and oversized reads', async () => {
    const read = registry.get('tuff_read_file')!
    const binary = await read.execute({ path: '/tmp/image.png' })
    expect(binary).toMatchObject({ isError: true })
    expect(binary.output).toContain('binary')

    const missing = await read.execute({ path: '/tmp/definitely-not-here-9f8a7.txt' })
    expect(missing.isError).toBe(true)
  })

  it('requires arguments rather than guessing', async () => {
    expect(await registry.get('tuff_search_files')!.execute({})).toMatchObject({ isError: true })
    expect(await registry.get('tuff_read_file')!.execute({})).toMatchObject({ isError: true })
    expect(await registry.get('tuff_open_path')!.execute({})).toMatchObject({ isError: true })
  })

  it('expands ~ and relativises against cwd', () => {
    expect(resolveUserPath('~/x').startsWith('/')).toBe(true)
    expect(resolveUserPath('~/x')).not.toContain('~')
    expect(resolveUserPath('/abs/path')).toBe('/abs/path')
    expect(resolveUserPath('')).toBe('')
  })

  it('summarises calls for the confirmation card', () => {
    expect(registry.get('tuff_search_files')!.summarize({ query: 'report' })).toContain('report')
    expect(registry.get('tuff_open_path')!.summarize({ path: '/tmp/x' })).toContain('/tmp/x')
  })
})

describe('chart spec validation', () => {
  const registry = createToolRegistry({
    searchFiles: async () => [],
    openPath: async () => ''
  })
  const chart = registry.get('tuff_render_chart')!

  it('accepts a well-formed spec and marks the result for the renderer', async () => {
    const result = await chart.execute({
      type: 'bar',
      title: 'Downloads',
      labels: ['Mon', 'Tue'],
      series: [{ name: 'count', values: [3, 5] }]
    })

    expect(result.isError).toBe(false)
    expect(result.output.startsWith(CHART_RESULT_PREFIX)).toBe(true)
    expect(JSON.parse(result.output.slice(CHART_RESULT_PREFIX.length))).toMatchObject({
      type: 'bar',
      title: 'Downloads',
      labels: ['Mon', 'Tue'],
      series: [{ name: 'count', values: [3, 5] }]
    })
  })

  it('rejects unknown chart types and empty data', () => {
    expect(parseChartSpec({ type: 'sankey', labels: ['a'], series: [{ values: [1] }] })).toContain(
      'type must be one of'
    )
    expect(parseChartSpec({ type: 'bar', labels: [], series: [{ values: [] }] })).toContain(
      'labels must be'
    )
    expect(parseChartSpec({ type: 'bar', labels: ['a'], series: [] })).toContain('series must be')
  })

  it('requires one value per label so a chart cannot render misaligned', () => {
    expect(
      parseChartSpec({ type: 'line', labels: ['a', 'b'], series: [{ values: [1] }] })
    ).toContain('one value per label')
  })

  it('coerces non-numeric values to zero rather than failing the whole chart', () => {
    const spec = parseChartSpec({
      type: 'line',
      labels: ['a', 'b'],
      series: [{ values: [1, 'oops'] }]
    })
    expect(typeof spec).not.toBe('string')
    expect((spec as { series: Array<{ values: number[] }> }).series[0]!.values).toEqual([1, 0])
  })

  it('accepts the extended chart family and passes presentation options through', () => {
    for (const type of ['area', 'doughnut', 'radar', 'funnel', 'gauge', 'heatmap']) {
      const spec = parseChartSpec({ type, labels: ['a'], series: [{ values: [1] }] })
      expect(typeof spec, `${type} should validate`).not.toBe('string')
    }

    const spec = parseChartSpec({
      type: 'bar',
      labels: ['q1', 'q2'],
      series: [{ name: 's', values: [1, 2] }],
      xLabel: 'Quarter',
      yLabel: 'Sales',
      stacked: true,
      showValues: true
    })
    expect(spec).toMatchObject({
      xLabel: 'Quarter',
      yLabel: 'Sales',
      stacked: true,
      showValues: true
    })
  })

  it('never needs a confirmation beyond read risk', () => {
    // It only draws data the model already holds; nothing on the machine is touched.
    expect(chart.risk).toBe('read')
  })
})
