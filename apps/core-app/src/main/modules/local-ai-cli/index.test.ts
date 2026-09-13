import type {
  LocalAiCliProviderCapabilities,
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliTaskChunk
} from '@talex-touch/utils/transport/events/local-ai-cli'
/**
 * Local AI CLI continuation runs a real provider process against a real project directory, so these
 * tests double only the two external boundaries (the provider child process / PTY / Claude SDK) and
 * keep the module's own transport handlers, lease registry, DB pointer store and Pi session-file
 * verification running for real. What they defend:
 *  - an invalid continuation (wrong provider/project, missing or conflicted pointer, unsupported
 *    resume capability, a second holder of the same provider/root/native-id tuple) fails before any
 *    process is spawned instead of silently starting a fresh session;
 *  - the renderer only ever sees the opaque `sessionRef`, never a native id or transcript path;
 *  - a native-session lease is released exactly once and effectively on every teardown path.
 * No provider quota is spent: `spawnSafe`, `node-pty` and the Claude Agent SDK are injected doubles.
 */
import type { ChildProcess } from 'node:child_process'
import type { StoredLocalAiCliSession } from './session-store'
import { EventEmitter } from 'node:events'
import { appendFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { LocalAiCliEvents } from '@talex-touch/utils/transport/events/local-ai-cli'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalAiCliModule } from './index'
import { markLocalAiCliSessionState, upsertLocalAiCliSession } from './session-store'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

const {
  getTuffTransportMainMock,
  resolveProviderStatusMock,
  resolveAllProviderStatusesMock,
  spawnSafeMock,
  ptySpawnMock,
  claudeQueryMock,
  getMainConfigMock,
  saveMainConfigMock,
  databaseRef
} = vi.hoisted(() => ({
  getTuffTransportMainMock: vi.fn(),
  resolveProviderStatusMock: vi.fn(),
  resolveAllProviderStatusesMock: vi.fn(),
  spawnSafeMock: vi.fn(),
  ptySpawnMock: vi.fn(),
  claudeQueryMock: vi.fn(),
  getMainConfigMock: vi.fn(),
  saveMainConfigMock: vi.fn(),
  databaseRef: { current: null as unknown }
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => ({ id: 7 })) },
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog: vi.fn() }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: getTuffTransportMainMock
}))

vi.mock('./executable-resolver', () => ({
  resolveLocalAiCliProviderStatus: resolveProviderStatusMock,
  resolveAllLocalAiCliProviderStatuses: resolveAllProviderStatusesMock
}))

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock
}))

vi.mock('../global-shortcon', () => ({
  shortcutModule: {
    registerMainShortcut: vi.fn(),
    unregisterMainShortcut: vi.fn()
  }
}))

vi.mock('../omni-panel', () => ({
  omniPanelModule: {
    showLocalAi: vi.fn(),
    restoreLocalAi: vi.fn(),
    hideForPasteBack: vi.fn()
  }
}))

vi.mock('../system/active-app', () => ({
  activeAppService: { getActiveApp: vi.fn(async () => null) }
}))

vi.mock('../system/desktop-shortcut', () => ({
  sendPlatformShortcut: vi.fn(async () => undefined)
}))

vi.mock('../platform/capability-adapter', () => ({
  getAutoPasteCapabilityPatch: vi.fn(async () => ({ supportLevel: 'unsupported' }))
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  spawnSafe: spawnSafeMock,
  execFileSafe: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn: ptySpawnMock }))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: claudeQueryMock }))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('../database', () => ({
  databaseModule: { getDb: () => databaseRef.current as never }
}))

// The scheduler only serialises; running the task inline keeps these tests about the handler flow.
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_label: string, task: () => Promise<unknown>) => task()
}))

interface PiEntry {
  type: string
  id: string
  parentId: string | null
  message?: { role?: string; content?: unknown }
}

interface PiSnapshot {
  entries: PiEntry[]
  leafId: string | null
}

interface FakePty {
  state: { kills: number; writes: string[]; resizes: Array<[number, number]> }
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (listener: (data: string) => void) => { dispose: () => void }
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => {
    dispose: () => void
  }
  emitExit: (exitCode: number) => void
}

interface TaskStream {
  context: Record<string, unknown>
  chunks: LocalAiCliTaskChunk[]
  controller: AbortController
  isEnded: () => boolean
}

type FakeSender = EventEmitter & { id: number; isDestroyed: () => boolean }

type RegisteredHandler = (payload: unknown, context: unknown) => unknown

interface FakeTransport {
  handlers: Map<string, RegisteredHandler>
  streamHandlers: Map<string, RegisteredHandler>
  broadcasts: Array<{ event: string; payload: unknown }>
  broadcast: ReturnType<typeof vi.fn>
  broadcastToWindow: ReturnType<typeof vi.fn>
  sendTo: ReturnType<typeof vi.fn>
  sendToWindow: ReturnType<typeof vi.fn>
  on: (event: { toEventName: () => string } | string, handler: RegisteredHandler) => () => void
  onStream: (
    event: { toEventName: () => string } | string,
    handler: RegisteredHandler
  ) => () => void
}

const piBaseEntries: PiEntry[] = [
  piEntry('h1', null, 'user', 'first question'),
  piEntry('h2', 'h1', 'assistant', 'first answer')
]
const PI_BASE_LEAF = 'h2'

const registeredModules: LocalAiCliModule[] = []
const ptyInstances: FakePty[] = []
const claudeOptions: Array<Record<string, unknown>> = []

let client: ReturnType<typeof createClient>
let db: ReturnType<typeof drizzle>
let tempRoot: string
let moduleDir: string
let projectRoot: string
let statusOverrides: { capabilities?: Partial<LocalAiCliProviderCapabilities> } = {}
let originalPlatform: NodeJS.Platform
let originalBetaFlag: string | undefined

function piEntry(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  text: string
): PiEntry {
  return { type: 'message', id, parentId, message: { role, content: [{ type: 'text', text }] } }
}

function piEntryLine(entry: PiEntry): string {
  return `${JSON.stringify(entry)}\n`
}

function fakeStream(): EventEmitter & { setEncoding: (encoding: string) => void } {
  const stream = new EventEmitter() as EventEmitter & { setEncoding: (encoding: string) => void }
  stream.setEncoding = () => undefined
  return stream
}

class FakeChildProcess extends EventEmitter {
  readonly writes: string[] = []
  readonly stdout = fakeStream()
  readonly stderr = fakeStream()
  readonly stdin = {
    writable: true,
    write: (chunk: string): boolean => {
      this.writes.push(chunk)
      return true
    }
  }

  kills = 0
  private closed = false

  kill = (): boolean => {
    this.kills += 1
    this.close(0)
    return true
  }

  close(code: number | null = 0): void {
    if (this.closed) return
    this.closed = true
    queueMicrotask(() => this.emit('close', code))
  }

  sendLine(value: string | Record<string, unknown>): void {
    this.stdout.emit('data', `${typeof value === 'string' ? value : JSON.stringify(value)}\n`)
  }

  frames(): Array<Record<string, unknown>> {
    return this.writes.map((write) => JSON.parse(write.trim()) as Record<string, unknown>)
  }

  framesOfType(type: string): Array<Record<string, unknown>> {
    return this.frames().filter((frame) => frame.type === type)
  }

  framesOfMethod(method: string): Array<Record<string, unknown>> {
    return this.frames().filter((frame) => frame.method === method)
  }
}

function createFakeTransport(): FakeTransport {
  const handlers = new Map<string, RegisteredHandler>()
  const streamHandlers = new Map<string, RegisteredHandler>()
  const broadcasts: Array<{ event: string; payload: unknown }> = []
  return {
    handlers,
    streamHandlers,
    broadcasts,
    broadcast: vi.fn((event: { toEventName: () => string }, payload: unknown) => {
      broadcasts.push({ event: event.toEventName(), payload })
    }),
    broadcastToWindow: vi.fn(),
    sendTo: vi.fn(async () => undefined),
    sendToWindow: vi.fn(async () => undefined),
    // The host registration APIs both key by event name, and some call sites pass the raw name
    // instead of the definition object; accept either shape.
    on: (event, handler) => {
      const name = typeof event === 'string' ? event : event.toEventName()
      handlers.set(name, handler)
      return () => handlers.delete(name)
    },
    onStream: (event, handler) => {
      const name = typeof event === 'string' ? event : event.toEventName()
      streamHandlers.set(name, handler)
      return () => streamHandlers.delete(name)
    }
  }
}

function createFakePty(): FakePty {
  const state = { kills: 0, writes: [] as string[], resizes: [] as Array<[number, number]> }
  const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = []
  return {
    state,
    write: (data) => state.writes.push(data),
    resize: (cols, rows) => state.resizes.push([cols, rows]),
    kill: () => {
      state.kills += 1
    },
    onData: () => ({ dispose: () => undefined }),
    onExit: (listener) => {
      exitListeners.push(listener)
      return { dispose: () => undefined }
    },
    emitExit: (exitCode) => {
      for (const listener of exitListeners) listener({ exitCode })
    }
  }
}

function createFakeSender(id = 42): FakeSender {
  const sender = new EventEmitter() as FakeSender
  sender.id = id
  sender.isDestroyed = () => false
  return sender
}

function createMessageQueue<T>(messages: readonly T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const message of messages) yield message
    }
  }
}

async function waitFor(condition: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 5_000; attempt += 1) {
    if (condition()) return
    await new Promise<void>((resolveTick) => setImmediate(resolveTick))
  }
  throw new Error(`Timed out waiting for ${description}`)
}

function providerStatus(provider: LocalAiCliProviderId): LocalAiCliProviderStatus {
  return {
    id: provider,
    label: provider,
    enabled: true,
    installed: true,
    version: '1.0.0',
    executablePath: `/fake/bin/${provider}`,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: true,
      ...statusOverrides.capabilities
    }
  }
}

function appSettings(): Record<string, unknown> {
  return {
    localAiCli: {
      enabled: true,
      defaultProvider: 'pi',
      providers: {
        pi: { enabled: true, executableOverride: '/fake/bin/pi' },
        codex: { enabled: true, executableOverride: '/fake/bin/codex' },
        claude: { enabled: true, executableOverride: '/fake/bin/claude' },
        'oh-my-pi': { enabled: true, executableOverride: '/fake/bin/oh-my-pi' }
      }
    }
  }
}

function taskPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: 'pi',
    prompt: 'Project smoke title\nPROMPT_BODY_CANARY',
    access: 'workspace-read',
    context: [],
    ...overrides
  }
}

function taskStream(): TaskStream {
  const chunks: LocalAiCliTaskChunk[] = []
  const controller = new AbortController()
  let ended = false
  return {
    chunks,
    controller,
    isEnded: () => ended,
    context: {
      plugin: null,
      sender: { id: 11 },
      emit: (chunk: LocalAiCliTaskChunk) => chunks.push(chunk),
      end: () => {
        ended = true
      },
      signal: controller.signal,
      isCancelled: () => controller.signal.aborted
    }
  }
}

async function initModule(): Promise<{ module: LocalAiCliModule; transport: FakeTransport }> {
  const transport = createFakeTransport()
  getTuffTransportMainMock.mockReturnValue(transport as never)
  const module = new LocalAiCliModule()
  registeredModules.push(module)
  await module.onInit({
    file: { dirPath: moduleDir },
    runtime: { app: { channel: {}, window: { window: {} } }, channel: {} }
  } as never)
  return { module, transport }
}

function expectSpawn(): FakeChildProcess {
  const child = new FakeChildProcess()
  spawnSafeMock.mockImplementationOnce(() => child as unknown as ChildProcess)
  return child
}

function spawnCall(index = 0): {
  command: string
  args: string[]
  options: Record<string, unknown>
} {
  const call = spawnSafeMock.mock.calls[index]
  if (!call) throw new Error(`spawnSafe call ${index} is missing`)
  return {
    command: call[0] as string,
    args: call[1] as string[],
    options: call[2] as Record<string, unknown>
  }
}

async function invokeHandler(
  transport: FakeTransport,
  name: string,
  payload: unknown,
  context: unknown
): Promise<unknown> {
  const handler = transport.handlers.get(name)
  if (!handler) throw new Error(`Handler ${name} is not registered as an invoke handler`)
  return await handler(payload, context)
}

async function invokeStreamHandler(
  transport: FakeTransport,
  name: string,
  payload: unknown,
  context: unknown
): Promise<unknown> {
  const handler = transport.streamHandlers.get(name)
  if (!handler) {
    const registered = [...transport.streamHandlers.keys()].join(', ') || 'none'
    throw new Error(`Stream handler ${name} is not registered (registered: ${registered})`)
  }
  return await handler(payload, context)
}

async function startTask(
  transport: FakeTransport,
  payload: unknown,
  context: unknown
): Promise<void> {
  await invokeStreamHandler(transport, LocalAiCliEvents.task.stream.toEventName(), payload, context)
}

function taskSessionChunk(
  chunks: LocalAiCliTaskChunk[]
): Extract<LocalAiCliTaskChunk, { type: 'session' }> {
  const chunk = chunks.find((candidate) => candidate.type === 'session')
  if (!chunk || chunk.type !== 'session') throw new Error('No session chunk was emitted')
  return chunk
}

function expectOpaqueTaskChunks(chunks: LocalAiCliTaskChunk[], secrets: readonly string[]): void {
  const sessionChunk = taskSessionChunk(chunks)
  expect(Object.keys(sessionChunk).sort()).toEqual(['callId', 'provider', 'sessionRef', 'type'])
  const serialized = JSON.stringify(chunks)
  for (const secret of secrets) expect(serialized).not.toContain(secret)
}

async function writePiSessionFile(
  sessionId: string,
  entries: PiEntry[],
  cwd: string = projectRoot
): Promise<string> {
  const file = join(tempRoot, `${sessionId}.jsonl`)
  const header = `${JSON.stringify({ type: 'session', id: sessionId, cwd })}\n`
  await writeFile(file, header + entries.map(piEntryLine).join(''))
  return file
}

async function completePiRun(
  child: FakeChildProcess,
  input: {
    sessionId: string
    sessionFile: string
    before: PiSnapshot
    append: string
    post: PiSnapshot
    answer: string
  }
): Promise<void> {
  await waitFor(() => child.framesOfType('get_state').length > 0, 'the initial get_state frame')
  child.sendLine({
    type: 'response',
    command: 'get_state',
    success: true,
    data: { sessionId: input.sessionId, sessionFile: input.sessionFile }
  })

  await waitFor(
    () => child.framesOfType('get_entries').length === 1,
    'the pre-run get_entries frame'
  )
  child.sendLine({ type: 'response', command: 'get_entries', success: true, data: input.before })

  await waitFor(() => child.framesOfType('prompt').length === 1, 'the prompt frame')
  child.sendLine({
    type: 'message_update',
    assistantMessageEvent: { type: 'text_delta', delta: input.answer }
  })
  child.sendLine({
    type: 'message_end',
    message: { role: 'assistant', content: [{ type: 'text', text: input.answer }] }
  })
  child.sendLine({ type: 'agent_end' })

  await waitFor(
    () => child.framesOfType('get_entries').length === 2,
    'the post-run get_entries frame'
  )
  await appendFile(input.sessionFile, input.append)
  child.sendLine({ type: 'response', command: 'get_entries', success: true, data: input.post })

  await waitFor(() => child.kills > 0, 'provider termination after verification')
}

async function seedProject(id: string, root: string = projectRoot): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, 0, 0, 1, 1, 1)',
    args: [id, root, id]
  })
}

async function seedPointer(input: {
  nativeSessionId: string
  projectId?: string | null
  provider?: LocalAiCliProviderId
  root?: string
  prompt?: string
  expectedHeadId?: string | null
  state?: StoredLocalAiCliSession['state']
}): Promise<StoredLocalAiCliSession> {
  const created = await upsertLocalAiCliSession({
    projectId: input.projectId ?? null,
    provider: input.provider ?? 'pi',
    projectRoot: input.root ?? projectRoot,
    nativeSessionId: input.nativeSessionId,
    prompt: input.prompt ?? 'seed prompt',
    expectedHeadId: input.expectedHeadId ?? null
  })
  if (!input.state || input.state === 'available') return created
  return await markLocalAiCliSessionState(created.id, input.state)
}

async function pointerRow(sessionRef: string): Promise<Record<string, unknown> | undefined> {
  const result = await client.execute({
    sql: 'SELECT * FROM local_ai_cli_sessions WHERE id = ?',
    args: [sessionRef]
  })
  return result.rows[0] as Record<string, unknown> | undefined
}

async function pointerCount(): Promise<number> {
  const result = await client.execute('SELECT COUNT(*) AS total FROM local_ai_cli_sessions')
  return Number(result.rows[0]?.total ?? 0)
}

async function createTerminal(
  transport: FakeTransport,
  payload: Record<string, unknown>,
  sender: FakeSender
): Promise<{ sessionId: string }> {
  return (await invokeHandler(transport, LocalAiCliEvents.terminal.create.toEventName(), payload, {
    plugin: null,
    sender
  })) as { sessionId: string }
}

/**
 * Proves the tuple is free again by taking it a second time: a still-held lease rejects with
 * NATIVE_SESSION_BUSY, so this helper fails loudly if any teardown path leaked the hold.
 */
async function expectTupleFree(
  transport: FakeTransport,
  pointer: StoredLocalAiCliSession,
  sender: FakeSender
): Promise<void> {
  const created = await createTerminal(
    transport,
    {
      provider: pointer.provider,
      access: 'workspace-read',
      cols: 80,
      rows: 24,
      sessionRef: pointer.id,
      ...(pointer.projectId ? { projectId: pointer.projectId } : {})
    },
    sender
  )
  expect(created.sessionId).toBeTruthy()
  await invokeHandler(
    transport,
    LocalAiCliEvents.terminal.kill.toEventName(),
    { sessionId: created.sessionId },
    { plugin: null, sender }
  )
}

beforeEach(async () => {
  originalPlatform = process.platform
  originalBetaFlag = process.env.TUFF_ENABLE_LOCAL_AI_CLI
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  process.env.TUFF_ENABLE_LOCAL_AI_CLI = '1'

  tempRoot = await realpath(await mkdtemp(join(tmpdir(), 'local-ai-cli-module-')))
  projectRoot = join(tempRoot, 'project')
  moduleDir = join(tempRoot, 'module')
  await mkdir(projectRoot, { recursive: true })

  client = createClient({ url: `file:${join(tempRoot, 'database.db')}` })
  db = drizzle(client)
  await migrate(db, { migrationsFolder })
  databaseRef.current = db

  statusOverrides = {}
  ptyInstances.length = 0
  claudeOptions.length = 0
  getMainConfigMock.mockReturnValue(appSettings())
  resolveProviderStatusMock.mockImplementation(async (provider: LocalAiCliProviderId) =>
    providerStatus(provider)
  )
  resolveAllProviderStatusesMock.mockImplementation(async () =>
    (['pi', 'codex', 'claude', 'oh-my-pi'] as const).map(providerStatus)
  )
  spawnSafeMock.mockReset()
  // A gate test that reaches a spawn is a defect in the gate, so fail loudly instead of hanging.
  spawnSafeMock.mockImplementation(() => {
    throw new Error('spawnSafe was not expected to run in this test')
  })
  ptySpawnMock.mockReset()
  ptySpawnMock.mockImplementation(() => {
    const pty = createFakePty()
    ptyInstances.push(pty)
    return pty as never
  })
  claudeQueryMock.mockReset()
  claudeQueryMock.mockImplementation((input: { options: Record<string, unknown> }) => {
    claudeOptions.push(input.options)
    return createMessageQueue([])
  })
})

afterEach(async () => {
  for (const module of registeredModules.splice(0)) {
    await module.onDestroy({} as never)
  }
  client.close()
  await rm(tempRoot, { recursive: true, force: true })
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  if (originalBetaFlag === undefined) delete process.env.TUFF_ENABLE_LOCAL_AI_CLI
  else process.env.TUFF_ENABLE_LOCAL_AI_CLI = originalBetaFlag
})

describe('localAiCli task resume gates', () => {
  it('rejects a sessionRef whose stored provider does not match the request', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-gate-1', expectedHeadId: 'h2' })
    const stream = taskStream()

    await expect(
      startTask(
        transport,
        taskPayload({ provider: 'oh-my-pi', sessionRef: pointer.id }),
        stream.context
      )
    ).rejects.toThrow('NATIVE_SESSION_CONFLICT')

    expect(spawnSafeMock).not.toHaveBeenCalled()
    expect((await pointerRow(pointer.id))?.state).toBe('available')
    expect(await pointerCount()).toBe(1)
  })

  it('rejects a sessionRef from another project instead of continuing it in this one', async () => {
    const { transport } = await initModule()
    await seedProject('proj-a')
    const otherRoot = join(tempRoot, 'project-b')
    await mkdir(otherRoot, { recursive: true })
    await seedProject('proj-b', otherRoot)
    const pointer = await seedPointer({
      nativeSessionId: 'pi-gate-2',
      projectId: 'proj-a',
      expectedHeadId: 'h2'
    })

    await expect(
      startTask(
        transport,
        taskPayload({ projectId: 'proj-b', sessionRef: pointer.id }),
        taskStream().context
      )
    ).rejects.toThrow('NATIVE_SESSION_CONFLICT')
    // Omitting the project while the pointer belongs to one is the same mismatch, not a Home run.
    await expect(
      startTask(transport, taskPayload({ sessionRef: pointer.id }), taskStream().context)
    ).rejects.toThrow('NATIVE_SESSION_CONFLICT')

    expect(spawnSafeMock).not.toHaveBeenCalled()
    expect(await pointerCount()).toBe(1)
  })

  it.each([
    {
      name: 'a pointer the store no longer has',
      state: undefined,
      expected: 'NATIVE_SESSION_MISSING'
    },
    {
      name: 'a pointer marked missing',
      state: 'missing' as const,
      expected: 'NATIVE_SESSION_MISSING'
    },
    {
      name: 'a pointer marked conflicted',
      state: 'conflict' as const,
      expected: 'NATIVE_SESSION_CONFLICT'
    }
  ])('rejects $name without starting a fresh session', async ({ state, expected }) => {
    const { transport } = await initModule()
    let sessionRef = 'locally-generated-ref'
    if (state) {
      const pointer = await seedPointer({
        nativeSessionId: `pi-gate-${state}`,
        expectedHeadId: 'h2',
        state
      })
      sessionRef = pointer.id
    }

    await expect(
      startTask(transport, taskPayload({ sessionRef }), taskStream().context)
    ).rejects.toThrow(expected)

    expect(spawnSafeMock).not.toHaveBeenCalled()
    expect(await pointerCount()).toBe(state ? 1 : 0)
  })

  it('rejects a resume the live provider capabilities do not support', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-gate-3', expectedHeadId: 'h2' })
    statusOverrides = { capabilities: { taskResume: false } }

    await expect(
      startTask(transport, taskPayload({ sessionRef: pointer.id }), taskStream().context)
    ).rejects.toThrow('PROVIDER_RESUME_UNSUPPORTED')

    expect(spawnSafeMock).not.toHaveBeenCalled()
    expect(await pointerCount()).toBe(1)
    expect((await pointerRow(pointer.id))?.state).toBe('available')
  })

  it('refuses a project whose root no longer resolves to the stored directory', async () => {
    const { transport } = await initModule()
    await seedProject('proj-moved', join(tempRoot, 'moved-away'))

    await expect(
      startTask(transport, taskPayload({ projectId: 'proj-moved' }), taskStream().context)
    ).rejects.toThrow('WORKSPACE_INVALID')

    expect(spawnSafeMock).not.toHaveBeenCalled()
    expect(await pointerCount()).toBe(0)
  })

  it('rejects a second holder of the same provider/root/native-id tuple before spawning', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-busy-1', expectedHeadId: 'h2' })
    const child = expectSpawn()
    const first = startTask(
      transport,
      taskPayload({ sessionRef: pointer.id }),
      taskStream().context
    )
    await waitFor(() => spawnSafeMock.mock.calls.length === 1, 'the first provider spawn')

    const sender = createFakeSender()
    await expect(
      startTask(transport, taskPayload({ sessionRef: pointer.id }), taskStream().context)
    ).rejects.toThrow('NATIVE_SESSION_BUSY')
    await expect(
      createTerminal(
        transport,
        {
          provider: 'pi',
          access: 'workspace-read',
          cols: 80,
          rows: 24,
          sessionRef: pointer.id
        },
        sender
      )
    ).rejects.toThrow('NATIVE_SESSION_BUSY')

    expect(spawnSafeMock).toHaveBeenCalledTimes(1)
    expect(ptySpawnMock).not.toHaveBeenCalled()

    child.close(0)
    await first
  })
})

describe('localAiCli terminal resume gates', () => {
  it('rejects a resumed terminal when the provider cannot resume terminals', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-term-gate-1', expectedHeadId: 'h2' })
    statusOverrides = { capabilities: { terminalResume: false } }

    await expect(
      createTerminal(
        transport,
        {
          provider: 'pi',
          access: 'workspace-read',
          cols: 80,
          rows: 24,
          sessionRef: pointer.id
        },
        createFakeSender()
      )
    ).rejects.toThrow('PROVIDER_RESUME_UNSUPPORTED')

    expect(ptySpawnMock).not.toHaveBeenCalled()
    expect(await pointerCount()).toBe(1)
  })

  it('rejects a resumed terminal whose provider or project does not own the pointer', async () => {
    const { transport } = await initModule()
    await seedProject('proj-term-a')
    const pointer = await seedPointer({
      nativeSessionId: 'pi-term-gate-2',
      projectId: 'proj-term-a',
      expectedHeadId: 'h2'
    })
    const sender = createFakeSender()

    await expect(
      createTerminal(
        transport,
        { provider: 'codex', access: 'workspace-read', cols: 80, rows: 24, sessionRef: pointer.id },
        sender
      )
    ).rejects.toThrow('NATIVE_SESSION_CONFLICT')
    await expect(
      createTerminal(
        transport,
        { provider: 'pi', access: 'workspace-read', cols: 80, rows: 24, sessionRef: pointer.id },
        sender
      )
    ).rejects.toThrow('NATIVE_SESSION_CONFLICT')

    expect(ptySpawnMock).not.toHaveBeenCalled()
  })

  it('composes the native resume selector with the fresh-terminal safety flags', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-term-resume-1', expectedHeadId: 'h2' })

    const created = await createTerminal(
      transport,
      { provider: 'pi', access: 'workspace-read', cols: 80, rows: 24, sessionRef: pointer.id },
      createFakeSender()
    )

    expect(created.sessionId).toBeTruthy()
    const spawn = ptySpawnMock.mock.calls[0]
    expect(spawn?.[0]).toBe('/fake/bin/pi')
    expect(spawn?.[1]).toEqual(
      expect.arrayContaining(['--no-tools', '--session', 'pi-term-resume-1'])
    )
    expect(spawn?.[2]).toMatchObject({ cwd: projectRoot })
  })
})

describe('localAiCli native-session leases', () => {
  it('releases the lease when a resumed run completes', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      nativeSessionId: 'pi-lease-complete',
      expectedHeadId: 'h2'
    })
    const sessionFile = await writePiSessionFile('pi-lease-complete', piBaseEntries)
    const appendedUser = piEntry('u3', PI_BASE_LEAF, 'user', 'second question')
    const appendedAssistant = piEntry('a3', 'u3', 'assistant', 'second answer')
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)

    await completePiRun(child, {
      sessionId: 'pi-lease-complete',
      sessionFile,
      before: { entries: piBaseEntries, leafId: PI_BASE_LEAF },
      append: piEntryLine(appendedUser) + piEntryLine(appendedAssistant),
      post: { entries: [...piBaseEntries, appendedUser, appendedAssistant], leafId: 'a3' },
      answer: 'second answer'
    })
    await run

    expect(stream.chunks.at(-1)).toMatchObject({ type: 'complete', text: 'second answer' })
    await expectTupleFree(transport, pointer, createFakeSender())
  })

  it('releases the lease when the caller cancels a resumed run', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-lease-cancel', expectedHeadId: 'h2' })
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)
    await waitFor(() => spawnSafeMock.mock.calls.length === 1, 'the provider spawn')

    stream.controller.abort()
    await run

    expect(stream.chunks).toContainEqual({ type: 'cancelled', callId: expect.any(String) })
    expect(child.kills).toBeGreaterThan(0)
    await expectTupleFree(transport, pointer, createFakeSender())
  })

  it('releases the lease when the provider process fails to start', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-lease-spawn', expectedHeadId: 'h2' })
    spawnSafeMock.mockReset()
    spawnSafeMock.mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    const stream = taskStream()

    await startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)

    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'PROCESS_START_FAILED',
      recoverable: true
    })
    expect((await pointerRow(pointer.id))?.state).toBe('available')
    await expectTupleFree(transport, pointer, createFakeSender())
  })

  it('releases the lease when the provider emits an unparsable protocol line', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      nativeSessionId: 'pi-lease-protocol',
      expectedHeadId: 'h2'
    })
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)
    await waitFor(() => spawnSafeMock.mock.calls.length === 1, 'the provider spawn')

    child.sendLine('{not json}')
    await run

    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'PROTOCOL_INVALID',
      recoverable: true
    })
    expect((await pointerRow(pointer.id))?.state).toBe('available')
    await expectTupleFree(transport, pointer, createFakeSender())
  })

  it('releases the resumed terminal lease on kill, provider exit, and sender destruction', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-term-lease', expectedHeadId: 'h2' })
    const sender = createFakeSender()
    const request = {
      provider: 'pi',
      access: 'workspace-read',
      cols: 80,
      rows: 24,
      sessionRef: pointer.id
    }

    const first = await createTerminal(transport, request, sender)
    await invokeHandler(
      transport,
      LocalAiCliEvents.terminal.kill.toEventName(),
      { sessionId: first.sessionId },
      { plugin: null, sender }
    )

    const second = await createTerminal(transport, request, sender)
    ptyInstances.at(-1)?.emitExit(0)

    const third = await createTerminal(transport, request, sender)
    expect(third.sessionId).not.toBe(second.sessionId)
    sender.emit('destroyed')

    await expectTupleFree(transport, pointer, sender)
  })

  it('releases a held task lease and kills the provider on module destroy', async () => {
    const { module, transport } = await initModule()
    const pointer = await seedPointer({ nativeSessionId: 'pi-lease-destroy', expectedHeadId: 'h2' })
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)
    await waitFor(() => child.framesOfType('get_state').length > 0, 'the provider handshake')

    await module.onDestroy({} as never)

    expect(child.kills).toBeGreaterThan(0)
    const leases = module as unknown as {
      nativeSessionLeases: { isLeased: (key: Record<string, string>) => boolean }
    }
    expect(
      leases.nativeSessionLeases.isLeased({
        provider: 'pi',
        projectRoot,
        nativeSessionId: 'pi-lease-destroy'
      })
    ).toBe(false)
    await run
    expect(stream.isEnded()).toBe(true)
  })
})

describe('localAiCli Pi task continuation', () => {
  it('registers a fresh pointer built only from opaque ids and bounded display metadata', async () => {
    const { transport } = await initModule()
    await seedProject('proj-fresh')
    const sessionFile = await writePiSessionFile('pi-fresh-1', [])
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(
      transport,
      taskPayload({ projectId: 'proj-fresh', prompt: 'Project smoke title\nPROMPT_BODY_CANARY' }),
      stream.context
    )
    const user = piEntry('u1', null, 'user', 'Project smoke title\nPROMPT_BODY_CANARY')
    const assistant = piEntry('a1', 'u1', 'assistant', 'OUTPUT_CANARY')

    await completePiRun(child, {
      sessionId: 'pi-fresh-1',
      sessionFile,
      before: { entries: [], leafId: null },
      append: piEntryLine(user) + piEntryLine(assistant),
      post: { entries: [user, assistant], leafId: 'a1' },
      answer: 'OUTPUT_CANARY'
    })
    await run

    const rows = await client.execute('SELECT * FROM local_ai_cli_sessions')
    expect(rows.rows).toHaveLength(1)
    const row = rows.rows[0]!
    expect(row.native_session_id).toBe('pi-fresh-1')
    expect(row.project_root).toBe(projectRoot)
    expect(row.project_id).toBe('proj-fresh')
    expect(row.title).toBe('Project smoke title')
    expect(row.expected_head_id).toBe('a1')
    expect(row.state).toBe('available')
    expect(row.origin).toBe('tuff')
    expect(taskSessionChunk(stream.chunks).sessionRef).toBe(row.id)

    const spawn = spawnCall()
    expect(spawn.command).toBe('/fake/bin/pi')
    expect(spawn.args).toContain('--mode')
    expect(spawn.args).not.toContain('--session')
    expect(spawn.options).toMatchObject({ cwd: projectRoot })
    // The prompt body and the provider transcript stay main-only; only sessionRef is renderer-safe.
    expectOpaqueTaskChunks(stream.chunks, [
      'pi-fresh-1',
      sessionFile,
      projectRoot,
      'PROMPT_BODY_CANARY'
    ])
    expect(stream.chunks.at(-1)).toMatchObject({ type: 'complete', text: 'OUTPUT_CANARY' })

    const project = await client.execute({
      sql: 'SELECT last_opened_at FROM projects WHERE id = ?',
      args: ['proj-fresh']
    })
    expect(Number(project.rows[0]?.last_opened_at)).toBeGreaterThan(1)
  })

  it('keeps quick-invoke dispatch inside the isolated Tuff workspace', async () => {
    const { transport } = await initModule()
    const workspacePath = join(moduleDir, 'workspace')
    const sessionFile = await writePiSessionFile('pi-quick-1', [], workspacePath)
    const user = piEntry('u1', null, 'user', 'quick question')
    const assistant = piEntry('a1', 'u1', 'assistant', 'quick answer')
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ prompt: 'quick question' }), stream.context)

    await completePiRun(child, {
      sessionId: 'pi-quick-1',
      sessionFile,
      before: { entries: [], leafId: null },
      append: piEntryLine(user) + piEntryLine(assistant),
      post: { entries: [user, assistant], leafId: 'a1' },
      answer: 'quick answer'
    })
    await run

    const row = await pointerRow(taskSessionChunk(stream.chunks).sessionRef)
    expect(row?.project_root).toBe(workspacePath)
    expect(row?.project_id).toBeNull()
    expect(spawnCall().options).toMatchObject({ cwd: workspacePath })
  })

  it('continues the stored native session and advances the head only after the file agrees', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      nativeSessionId: 'pi-resume-1',
      expectedHeadId: PI_BASE_LEAF
    })
    const sessionFile = await writePiSessionFile('pi-resume-1', piBaseEntries)
    const appendedUser = piEntry('u3', PI_BASE_LEAF, 'user', 'second question')
    const appendedAssistant = piEntry('a3', 'u3', 'assistant', 'second answer')
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)

    await completePiRun(child, {
      sessionId: 'pi-resume-1',
      sessionFile,
      before: { entries: piBaseEntries, leafId: PI_BASE_LEAF },
      append: piEntryLine(appendedUser) + piEntryLine(appendedAssistant),
      post: { entries: [...piBaseEntries, appendedUser, appendedAssistant], leafId: 'a3' },
      answer: 'second answer'
    })
    await run

    const row = await pointerRow(pointer.id)
    expect(row?.expected_head_id).toBe('a3')
    expect(row?.state).toBe('available')
    expect(await pointerCount()).toBe(1)
    expect(taskSessionChunk(stream.chunks).sessionRef).toBe(pointer.id)
    expect(spawnCall().args).toEqual(expect.arrayContaining(['--session', 'pi-resume-1']))
    expectOpaqueTaskChunks(stream.chunks, ['pi-resume-1', sessionFile, projectRoot])
  })

  it('marks the pointer conflicted when the provider reports a head the pointer never stored', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      nativeSessionId: 'pi-conflict-1',
      expectedHeadId: PI_BASE_LEAF
    })
    const sessionFile = await writePiSessionFile('pi-conflict-1', piBaseEntries)
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)

    await waitFor(() => child.framesOfType('get_state').length > 0, 'the initial get_state frame')
    child.sendLine({
      type: 'response',
      command: 'get_state',
      success: true,
      data: { sessionId: 'pi-conflict-1', sessionFile }
    })
    await waitFor(
      () => child.framesOfType('get_entries').length === 1,
      'the pre-run get_entries frame'
    )
    child.sendLine({
      type: 'response',
      command: 'get_entries',
      success: true,
      data: { entries: piBaseEntries, leafId: 'h-elsewhere' }
    })
    await run

    expect(child.framesOfType('prompt')).toHaveLength(0)
    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'NATIVE_SESSION_CONFLICT',
      recoverable: false
    })
    expect(stream.chunks.some((chunk) => chunk.type === 'complete')).toBe(false)
    expect((await pointerRow(pointer.id))?.state).toBe('conflict')
    expect((await pointerRow(pointer.id))?.expected_head_id).toBe(PI_BASE_LEAF)
  })

  it('marks the pointer conflicted when a second writer branched off the same captured head', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      nativeSessionId: 'pi-conflict-2',
      expectedHeadId: PI_BASE_LEAF
    })
    const sessionFile = await writePiSessionFile('pi-conflict-2', piBaseEntries)
    const competingUser = piEntry('u3', PI_BASE_LEAF, 'user', 'second question')
    const competingAssistant = piEntry('a3', 'u3', 'assistant', 'second answer')
    const siblingUser = piEntry('u4', PI_BASE_LEAF, 'user', 'competing question')
    const siblingAssistant = piEntry('a4', 'u4', 'assistant', 'competing answer')
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ sessionRef: pointer.id }), stream.context)

    await completePiRun(child, {
      sessionId: 'pi-conflict-2',
      sessionFile,
      before: { entries: piBaseEntries, leafId: PI_BASE_LEAF },
      append:
        piEntryLine(competingUser) +
        piEntryLine(competingAssistant) +
        piEntryLine(siblingUser) +
        piEntryLine(siblingAssistant),
      post: {
        entries: [
          ...piBaseEntries,
          competingUser,
          competingAssistant,
          siblingUser,
          siblingAssistant
        ],
        leafId: 'a4'
      },
      answer: 'second answer'
    })
    await run

    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'NATIVE_SESSION_CONFLICT',
      recoverable: false
    })
    expect(stream.chunks.some((chunk) => chunk.type === 'complete')).toBe(false)
    const row = await pointerRow(pointer.id)
    expect(row?.state).toBe('conflict')
    expect(row?.expected_head_id).toBe(PI_BASE_LEAF)
    expect(await pointerCount()).toBe(1)
    // The renderer has to learn about the conflict without an app restart.
    expect(transport.broadcasts).toContainEqual({
      event: LocalAiCliEvents.session.changed.toEventName(),
      payload: { sessionRef: pointer.id, projectId: null, type: 'upsert' }
    })
  })
})

describe('localAiCli OMP task continuation', () => {
  it('waits for the authoritative session/update before prompting a resumed session', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      provider: 'oh-my-pi',
      nativeSessionId: 'omp-resume-1',
      expectedHeadId: null
    })
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(
      transport,
      taskPayload({ provider: 'oh-my-pi', sessionRef: pointer.id }),
      stream.context
    )

    await waitFor(() => child.framesOfMethod('initialize').length === 1, 'the ACP initialize frame')
    child.sendLine({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } })
    await waitFor(() => child.framesOfMethod('session/resume').length === 1, 'the resume frame')
    // The installed ACP ResumeSessionResponse carries no session id (empty result here), so the id
    // must be confirmed by the first session/update before any prompt is delivered.
    child.sendLine({ jsonrpc: '2.0', id: 2, result: {} })
    expect(child.framesOfMethod('session/resume')[0]?.params).toMatchObject({
      sessionId: 'omp-resume-1',
      cwd: projectRoot
    })
    expect(child.framesOfMethod('session/new')).toHaveLength(0)
    expect(child.framesOfMethod('session/prompt')).toHaveLength(0)

    child.sendLine({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 'omp-resume-1', update: { sessionUpdate: 'agent_message_chunk' } }
    })
    await waitFor(() => child.framesOfMethod('session/prompt').length === 1, 'the prompt frame')
    expect(child.framesOfMethod('session/prompt')[0]?.params).toMatchObject({
      sessionId: 'omp-resume-1'
    })

    child.sendLine({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'omp-resume-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'omp answer' }
        }
      }
    })
    child.sendLine({ jsonrpc: '2.0', id: 3, result: { stopReason: 'end_turn' } })
    await run

    expect(taskSessionChunk(stream.chunks).sessionRef).toBe(pointer.id)
    expect(stream.chunks.at(-1)).toMatchObject({ type: 'complete', text: 'omp answer' })
    expectOpaqueTaskChunks(stream.chunks, ['omp-resume-1'])
  })

  it('marks the pointer missing when the confirming session/update names another session', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      provider: 'oh-my-pi',
      nativeSessionId: 'omp-resume-2',
      expectedHeadId: null
    })
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(
      transport,
      taskPayload({ provider: 'oh-my-pi', sessionRef: pointer.id }),
      stream.context
    )

    await waitFor(() => child.framesOfMethod('initialize').length === 1, 'the ACP initialize frame')
    child.sendLine({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } })
    await waitFor(() => child.framesOfMethod('session/resume').length === 1, 'the resume frame')
    child.sendLine({ jsonrpc: '2.0', id: 2, result: {} })
    child.sendLine({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 'omp-someone-else', update: { sessionUpdate: 'agent_message_chunk' } }
    })
    await run

    expect(child.framesOfMethod('session/prompt')).toHaveLength(0)
    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'NATIVE_SESSION_MISSING',
      recoverable: false
    })
    expect((await pointerRow(pointer.id))?.state).toBe('missing')
    expect(await pointerCount()).toBe(1)
  })

  it('starts a fresh OMP session with session/new and never resumes', async () => {
    const { transport } = await initModule()
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(transport, taskPayload({ provider: 'oh-my-pi' }), stream.context)

    await waitFor(() => child.framesOfMethod('initialize').length === 1, 'the ACP initialize frame')
    child.sendLine({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } })
    await waitFor(() => child.framesOfMethod('session/new').length === 1, 'the session/new frame')
    child.sendLine({ jsonrpc: '2.0', id: 2, result: { sessionId: 'omp-fresh-1' } })
    await waitFor(() => child.framesOfMethod('session/prompt').length === 1, 'the prompt frame')
    child.sendLine({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'omp-fresh-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'fresh answer' }
        }
      }
    })
    child.sendLine({ jsonrpc: '2.0', id: 3, result: { stopReason: 'end_turn' } })
    await run

    expect(child.framesOfMethod('session/resume')).toHaveLength(0)
    expect(stream.chunks.at(-1)).toMatchObject({ type: 'complete', text: 'fresh answer' })
    expectOpaqueTaskChunks(stream.chunks, ['omp-fresh-1'])
    expect(await pointerCount()).toBe(1)
  })
})

describe('localAiCli Codex task continuation', () => {
  async function startResumedCodexRun(): Promise<{
    child: FakeChildProcess
    stream: TaskStream
    run: Promise<void>
    pointer: StoredLocalAiCliSession
  }> {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      provider: 'codex',
      nativeSessionId: 'codex-resume-1',
      expectedHeadId: null
    })
    const child = expectSpawn()
    const stream = taskStream()
    const run = startTask(
      transport,
      taskPayload({ provider: 'codex', sessionRef: pointer.id }),
      stream.context
    )

    await waitFor(
      () => child.framesOfMethod('initialize').length === 1,
      'the app-server initialize frame'
    )
    child.sendLine({ id: 1, result: {} })
    return { child, stream, run, pointer }
  }

  it('resumes the stored thread with the pinned cwd, policy, and sandbox before prompting', async () => {
    const { child, stream, run, pointer } = await startResumedCodexRun()

    await waitFor(
      () => child.framesOfMethod('thread/resume').length === 1,
      'the thread/resume frame'
    )
    expect(child.framesOfMethod('thread/resume')[0]).toEqual({
      id: 2,
      method: 'thread/resume',
      params: {
        threadId: 'codex-resume-1',
        cwd: projectRoot,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        excludeTurns: true
      }
    })
    expect(child.framesOfMethod('thread/start')).toHaveLength(0)

    child.sendLine({ id: 2, result: { thread: { id: 'codex-resume-1', cwd: projectRoot } } })
    await waitFor(() => child.framesOfMethod('turn/start').length === 1, 'the turn/start frame')
    expect(child.framesOfMethod('turn/start')[0]?.params).toMatchObject({
      threadId: 'codex-resume-1',
      cwd: projectRoot,
      sandboxPolicy: { type: 'readOnly' }
    })

    child.sendLine({ method: 'item/agentMessage/delta', params: { delta: 'codex answer' } })
    child.sendLine({ method: 'turn/completed', params: { turn: { status: 'completed' } } })
    await run

    expect(taskSessionChunk(stream.chunks).sessionRef).toBe(pointer.id)
    expect(stream.chunks.at(-1)).toMatchObject({ type: 'complete', text: 'codex answer' })
    expectOpaqueTaskChunks(stream.chunks, ['codex-resume-1'])
  })

  it('refuses the resume when the returned thread id is not the stored one', async () => {
    const { child, stream, run, pointer } = await startResumedCodexRun()
    await waitFor(
      () => child.framesOfMethod('thread/resume').length === 1,
      'the thread/resume frame'
    )

    child.sendLine({ id: 2, result: { thread: { id: 'codex-someone-else' } } })
    await run

    expect(child.framesOfMethod('turn/start')).toHaveLength(0)
    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'NATIVE_SESSION_MISSING',
      recoverable: false
    })
    expect((await pointerRow(pointer.id))?.state).toBe('missing')
  })

  it('refuses the resume when the returned cwd is not the dispatch cwd', async () => {
    const otherRoot = join(tempRoot, 'other-project')
    await mkdir(otherRoot, { recursive: true })
    const { child, stream, run, pointer } = await startResumedCodexRun()
    await waitFor(
      () => child.framesOfMethod('thread/resume').length === 1,
      'the thread/resume frame'
    )

    child.sendLine({
      id: 2,
      result: { thread: { id: 'codex-resume-1', cwd: otherRoot } }
    })
    await run

    expect(child.framesOfMethod('turn/start')).toHaveLength(0)
    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'NATIVE_SESSION_CONFLICT',
      recoverable: false
    })
    expect((await pointerRow(pointer.id))?.state).toBe('conflict')
  })
})

describe('localAiCli Claude SDK continuation', () => {
  it('resumes with the stored session id and cwd and never starts a transcript copy', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      provider: 'claude',
      nativeSessionId: 'claude-resume-1',
      expectedHeadId: null
    })
    claudeQueryMock.mockImplementation((input: { options: Record<string, unknown> }) => {
      claudeOptions.push(input.options)
      return createMessageQueue([
        { type: 'system', subtype: 'init', session_id: 'claude-resume-1' },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'resumed answer' }
          }
        },
        {
          type: 'result',
          subtype: 'success',
          session_id: 'claude-resume-1',
          result: 'resumed answer'
        }
      ])
    })
    const stream = taskStream()

    await startTask(
      transport,
      taskPayload({ provider: 'claude', sessionRef: pointer.id }),
      stream.context
    )

    expect(claudeOptions[0]).toMatchObject({
      resume: 'claude-resume-1',
      cwd: projectRoot,
      pathToClaudeCodeExecutable: '/fake/bin/claude'
    })
    expect(spawnSafeMock).not.toHaveBeenCalled()
    expect(taskSessionChunk(stream.chunks).sessionRef).toBe(pointer.id)
    expect(stream.chunks.at(-1)).toMatchObject({ type: 'complete', text: 'resumed answer' })
    expectOpaqueTaskChunks(stream.chunks, ['claude-resume-1'])
    expect(await pointerCount()).toBe(1)
  })

  it('marks the pointer missing when the SDK emits a drifted session id', async () => {
    const { transport } = await initModule()
    const pointer = await seedPointer({
      provider: 'claude',
      nativeSessionId: 'claude-resume-2',
      expectedHeadId: null
    })
    claudeQueryMock.mockImplementation((input: { options: Record<string, unknown> }) => {
      claudeOptions.push(input.options)
      return createMessageQueue([{ type: 'system', subtype: 'init', session_id: 'claude-drifted' }])
    })
    const stream = taskStream()

    await startTask(
      transport,
      taskPayload({ provider: 'claude', sessionRef: pointer.id }),
      stream.context
    )

    expect(claudeOptions[0]?.resume).toBe('claude-resume-2')
    expect(stream.chunks.some((chunk) => chunk.type === 'session')).toBe(false)
    expect(stream.chunks).toContainEqual({
      type: 'failed',
      callId: expect.any(String),
      code: 'NATIVE_SESSION_MISSING',
      recoverable: false
    })
    expect((await pointerRow(pointer.id))?.state).toBe('missing')
    // A drifted id must not be adopted as a fresh continuation of the same project.
    expect(await pointerCount()).toBe(1)
  })

  it('registers a fresh pointer from the SDK session id without asking to resume', async () => {
    const { transport } = await initModule()
    claudeQueryMock.mockImplementation((input: { options: Record<string, unknown> }) => {
      claudeOptions.push(input.options)
      return createMessageQueue([
        { type: 'system', subtype: 'init', session_id: 'claude-fresh-1' },
        {
          type: 'result',
          subtype: 'success',
          session_id: 'claude-fresh-1',
          result: 'fresh answer'
        }
      ])
    })
    const stream = taskStream()

    await startTask(transport, taskPayload({ provider: 'claude' }), stream.context)

    expect(claudeOptions[0]?.resume).toBeUndefined()
    // A quick invoke carries no projectId/sessionRef, so it stays in the isolated Tuff workspace.
    expect(claudeOptions[0]).toMatchObject({
      cwd: join(moduleDir, 'workspace'),
      maxTurns: 1
    })
    expect(taskSessionChunk(stream.chunks).sessionRef).toBeTruthy()
    expect(stream.chunks.at(-1)).toMatchObject({ type: 'complete', text: 'fresh answer' })
    expectOpaqueTaskChunks(stream.chunks, ['claude-fresh-1'])
    expect(await pointerCount()).toBe(1)
  })
})
