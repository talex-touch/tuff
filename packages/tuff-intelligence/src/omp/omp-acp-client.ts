import type { ChildProcess } from 'node:child_process'
import type {
  AcpConfigOption,
  OmpAcpSpawnOptions,
  OmpSessionCreateOptions,
} from './types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { AcpClient, AcpSession, DEFAULT_ACP_CLIENT_INFO } from '../acp/acp-client'
import { buildSpawnEnv } from '../acp/process-utils'

export class OmpAcpSession extends AcpSession {
  constructor(
    sessionId: string,
    client: OmpAcpClient,
    configOptions: AcpConfigOption[] = [],
  ) {
    super(sessionId, client, configOptions)
  }
}

export class OmpAcpClient extends AcpClient {
  constructor(proc: ChildProcess) {
    super(proc, { label: 'OMP ACP' })
  }

  protected override createSessionInstance(
    sessionId: string,
    configOptions: AcpConfigOption[],
  ): OmpAcpSession {
    return new OmpAcpSession(sessionId, this, configOptions)
  }

  override async createSession(options: OmpSessionCreateOptions = {}): Promise<OmpAcpSession> {
    return (await super.createSession(options)) as OmpAcpSession
  }

  static override async spawn(options: OmpAcpSpawnOptions = {}): Promise<OmpAcpClient> {
    const executable = options.executablePath || 'omp'
    const extraArgs = options.args ?? []
    const args = extraArgs[0] === 'acp' ? [...extraArgs] : ['acp', ...extraArgs]
    const proc = spawn(executable, args, {
      cwd: options.cwd || process.cwd(),
      env: buildSpawnEnv(options.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const client = new OmpAcpClient(proc)
    if (options.onRequest) {
      client.setRequestHandler(options.onRequest)
    }
    if (options.onPermission) {
      client.setPermissionHandler(options.onPermission)
    }
    try {
      await client.initialize(
        options.clientInfo || options.protocolVersion !== undefined
          ? {
              clientInfo: options.clientInfo ?? DEFAULT_ACP_CLIENT_INFO,
              ...(options.protocolVersion !== undefined
                ? { protocolVersion: options.protocolVersion }
                : {}),
              ...(options.clientCapabilities !== undefined
                ? { clientCapabilities: options.clientCapabilities }
                : {}),
            }
          : undefined,
        options.initTimeoutMs,
        options.clientCapabilities,
      )
      return client
    }
    catch (error) {
      await client.close().catch(() => undefined)
      throw error
    }
  }
}
