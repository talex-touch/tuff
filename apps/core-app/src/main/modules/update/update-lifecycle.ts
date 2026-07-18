import type {
  UpdateLifecyclePhase,
  UpdateLifecycleSnapshot,
  UpdateProviderSource
} from '@talex-touch/utils'

const TERMINAL_UPDATE_PHASES: Partial<Record<UpdateLifecyclePhase, true>> = {
  idle: true,
  healthy: true,
  recovered: true,
  failed: true
}

const UPDATE_PHASE_TRANSITIONS: Record<UpdateLifecyclePhase, readonly UpdateLifecyclePhase[]> = {
  idle: [],
  checking: ['idle', 'available', 'failed'],
  available: ['downloading', 'failed'],
  downloading: ['available', 'verifying', 'failed'],
  verifying: ['ready', 'failed'],
  ready: ['install-scheduled', 'failed'],
  'install-scheduled': ['handoff-started', 'failed'],
  'handoff-started': ['awaiting-health', 'recovery-required', 'failed'],
  'awaiting-health': ['healthy', 'recovery-required', 'failed'],
  healthy: [],
  'recovery-required': ['recovering', 'failed'],
  recovering: ['recovered', 'failed'],
  recovered: [],
  failed: []
}

export interface UpdateLifecyclePatch {
  targetVersion?: string | null
  source?: UpdateProviderSource | null
  releaseTag?: string | null
  taskId?: string | null
  installMode?: UpdateLifecycleSnapshot['installMode']
  previousVersion?: string | null
  recoveryAvailable?: boolean
  installOnNormalQuit?: boolean
  rollbackCompatible?: boolean
  rollbackFromVersion?: string | null
  error?: UpdateLifecycleSnapshot['error']
}

export interface UpdateLifecycleTransitionCommand {
  attemptId: string
  expectedRevision: number
  to: UpdateLifecyclePhase
  patch?: UpdateLifecyclePatch
  now?: number
}

export class UpdateLifecycleConflictError extends Error {
  readonly code = 'UPDATE_LIFECYCLE_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'UpdateLifecycleConflictError'
  }
}

export function reduceUpdateLifecycle(
  current: UpdateLifecycleSnapshot,
  command: UpdateLifecycleTransitionCommand
): UpdateLifecycleSnapshot {
  if (current.attemptId !== command.attemptId) {
    throw new UpdateLifecycleConflictError('Update attempt does not match the active lifecycle')
  }
  if (current.revision !== command.expectedRevision) {
    throw new UpdateLifecycleConflictError('Update lifecycle revision is stale')
  }
  if (!UPDATE_PHASE_TRANSITIONS[current.phase].includes(command.to)) {
    throw new UpdateLifecycleConflictError(
      `Invalid update lifecycle transition: ${current.phase} -> ${command.to}`
    )
  }

  const patch = command.patch ?? {}
  const now = command.now ?? Date.now()
  const error = command.to === 'failed' ? (patch.error ?? current.error) : null
  if (command.to === 'failed' && !error) {
    throw new UpdateLifecycleConflictError('Failed update lifecycle requires a stable error')
  }

  return {
    ...current,
    ...patch,
    attemptId: current.attemptId,
    revision: current.revision + 1,
    phase: command.to,
    error,
    updatedAt: now
  }
}

export function isTerminalUpdatePhase(phase: UpdateLifecyclePhase): boolean {
  return TERMINAL_UPDATE_PHASES[phase] === true
}
