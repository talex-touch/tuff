import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const repositoryRoot = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../..',
)
const tuffEntrypoint = join(repositoryRoot, 'packages', 'tuff-cli', 'src', 'bin', 'tuff.ts')
const viteNodeEntrypoint = join(repositoryRoot, 'node_modules', '.bin', 'vite-node')
const temporaryRoots: string[] = []

interface CliFixture {
  configDir: string
  root: string
}

interface CliRunResult {
  code: number | null
  output: string
}

async function createCliFixture(): Promise<CliFixture> {
  const root = await mkdtemp(join(tmpdir(), 'tuff-cli-publish-'))
  const configDir = join(root, '.tuff')
  temporaryRoots.push(root)

  await mkdir(join(root, 'dist', 'build'), { recursive: true })
  await mkdir(configDir, { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'demo-plugin',
    version: '1.0.0',
  }))
  await writeFile(join(root, 'manifest.json'), JSON.stringify({
    id: 'com.tuffex.demo-plugin',
    name: 'demo-plugin',
    version: '1.0.0',
  }))
  await writeFile(join(root, 'dist', 'build', 'demo-plugin-1.0.0.tpex'), 'fixture archive')
  await writeFile(join(configDir, 'cli.json'), JSON.stringify({
    locale: 'en',
    onboardingCompleted: true,
    termsAcceptedAt: '2026-07-19T00:00:00.000Z',
  }))

  return { configDir, root }
}

async function runTuffPublish(
  fixture: CliFixture,
  args: string[],
  baseUrl: string,
): Promise<CliRunResult> {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(viteNodeEntrypoint, [tuffEntrypoint, 'publish', ...args], {
      cwd: fixture.root,
      env: {
        ...process.env,
        TUFF_AUTH_TOKEN: 'tuff_publish_regression_token',
        TUFF_CONFIG_DIR: fixture.configDir,
        TUFF_NEXUS_BASE_URL: baseUrl,
        TUFF_NON_INTERACTIVE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.once('error', rejectRun)
    child.once('close', (code) => {
      resolveRun({ code, output })
    })
  })
}

async function startAuthEndpoint() {
  let requestCount = 0
  const server = createServer((_request, response) => {
    requestCount += 1
    response.writeHead(503, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: 'authentication probe reached endpoint' }))
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP address for the local auth endpoint')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => await new Promise<void>(resolveClose => server.close(() => resolveClose())),
    get requestCount() {
      return requestCount
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('publish authentication boundary', () => {
  it('completes a dry-run against an unreachable Nexus endpoint without probing authentication', async () => {
    const fixture = await createCliFixture()

    const result = await runTuffPublish(
      fixture,
      ['--dry-run'],
      'http://127.0.0.1:1',
    )

    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('Dry run mode - no changes will be made')
  })

  it('probes authentication before a normal publish', async () => {
    const fixture = await createCliFixture()
    const endpoint = await startAuthEndpoint()

    try {
      const result = await runTuffPublish(fixture, [], endpoint.baseUrl)

      expect(endpoint.requestCount, result.output).toBe(1)
    }
    finally {
      await endpoint.close()
    }
  })
})
