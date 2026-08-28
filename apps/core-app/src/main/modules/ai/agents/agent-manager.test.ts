import type { AgentResult } from '@talex-touch/utils'
import { AgentStatus } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dependencyMocks = vi.hoisted(() => ({
  hasAgent: vi.fn(() => true),
  clearAgents: vi.fn(),
  clearTools: vi.fn(),
  getAgentStats: vi.fn(() => ({})),
  getToolStats: vi.fn(() => ({}))
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({ info: vi.fn(), warn: vi.fn() })
  })
}))

vi.mock('./agent-registry', () => ({
  agentRegistry: {
    hasAgent: dependencyMocks.hasAgent,
    clear: dependencyMocks.clearAgents,
    getStats: dependencyMocks.getAgentStats
  }
}))

vi.mock('./tool-registry', () => ({
  toolRegistry: {
    clear: dependencyMocks.clearTools,
    getStats: dependencyMocks.getToolStats
  }
}))

import { AgentManager } from './agent-manager'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createResult(
  taskId: string,
  status: AgentStatus,
  success: boolean,
  error?: string
): AgentResult {
  return {
    success,
    taskId,
    agentId: 'agent-safe',
    error,
    status,
    timestamp: Date.now()
  }
}

describe('AgentManager task lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dependencyMocks.hasAgent.mockReturnValue(true)
  })

  it('admits the runtime before returning and emits cancellation only after runtime settlement', async () => {
    const manager = new AgentManager()
    await manager.init()
    const execution = createDeferred<AgentResult>()
    const executor = vi.fn(() => execution.promise)
    const cancel = vi.fn(() => true)
    const completed = vi.fn()
    const failed = vi.fn()
    const cancelled = vi.fn()
    manager.setTaskRuntime(executor, cancel)
    manager.on('task:completed', completed)
    manager.on('task:failed', failed)
    manager.on('task:cancelled', cancelled)

    const submission = manager.executeTask({
      id: '/private/run id/\u4efb\u52a1',
      agentId: 'agent-safe',
      type: 'execute',
      input: { value: true }
    })

    expect(executor).toHaveBeenCalledOnce()
    const taskId = await submission
    await expect(manager.cancelTask(taskId)).resolves.toBe(true)
    expect(cancel).toHaveBeenCalledWith(taskId)
    expect(manager.getTaskStatus(taskId)).toBe(AgentStatus.RUNNING)
    expect(completed).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
    expect(cancelled).not.toHaveBeenCalled()

    execution.resolve(createResult(taskId, AgentStatus.CANCELLED, false, 'cancelled'))
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(manager.getTaskStatus(taskId)).toBe(AgentStatus.COMPLETED))

    expect(cancelled).toHaveBeenCalledWith({ taskId })
    expect(completed).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
    expect(manager.getStats().runtime).toMatchObject({
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0
    })
  })

  it('rejects a duplicate active task ID without disturbing the admitted task', async () => {
    const manager = new AgentManager()
    await manager.init()
    const execution = createDeferred<AgentResult>()
    const executor = vi.fn(() => execution.promise)
    const cancel = vi.fn(() => true)
    const started = vi.fn()
    manager.setTaskRuntime(executor, cancel)
    manager.on('task:started', started)

    const task = {
      id: 'task-duplicate',
      agentId: 'agent-safe',
      type: 'execute' as const,
      input: null
    }
    await expect(manager.executeTask(task)).resolves.toBe(task.id)
    await expect(manager.executeTask(task)).rejects.toThrow(
      'Agent task task-duplicate is already active'
    )

    expect(executor).toHaveBeenCalledOnce()
    expect(started).toHaveBeenCalledOnce()
    expect(manager.getTaskStatus(task.id)).toBe(AgentStatus.RUNNING)
    expect(manager.getStats().runtime.activeTasks).toBe(1)
    await expect(manager.cancelTask(task.id)).resolves.toBe(true)
    expect(cancel).toHaveBeenCalledWith(task.id)

    execution.resolve(createResult(task.id, AgentStatus.CANCELLED, false, 'cancelled'))
    await vi.waitFor(() => expect(manager.getTaskStatus(task.id)).toBe(AgentStatus.COMPLETED))
  })

  it('projects success and ordinary failure to exactly one terminal event each', async () => {
    const manager = new AgentManager()
    await manager.init()
    const successfulExecution = createDeferred<AgentResult>()
    const failedExecution = createDeferred<AgentResult>()
    const executor = vi.fn((task: { id?: string }) =>
      task.id === 'task-success' ? successfulExecution.promise : failedExecution.promise
    )
    const completed = vi.fn()
    const failed = vi.fn()
    const cancelled = vi.fn()
    manager.setTaskRuntime(executor, () => false)
    manager.on('task:completed', completed)
    manager.on('task:failed', failed)
    manager.on('task:cancelled', cancelled)

    await manager.executeTask({
      id: 'task-success',
      agentId: 'agent-safe',
      type: 'execute',
      input: null
    })
    await manager.executeTask({
      id: 'task-failure',
      agentId: 'agent-safe',
      type: 'execute',
      input: null
    })
    const successResult = createResult('task-success', AgentStatus.COMPLETED, true)
    const failureResult = createResult(
      'task-failure',
      AgentStatus.FAILED,
      false,
      'ordinary failure'
    )
    successfulExecution.resolve(successResult)
    failedExecution.resolve(failureResult)

    await vi.waitFor(() => {
      expect(completed).toHaveBeenCalledOnce()
      expect(failed).toHaveBeenCalledOnce()
      expect(manager.getStats().runtime.activeTasks).toBe(0)
    })
    expect(completed).toHaveBeenCalledWith({ taskId: 'task-success', result: successResult })
    expect(failed).toHaveBeenCalledWith({
      taskId: 'task-failure',
      error: 'ordinary failure'
    })
    expect(cancelled).not.toHaveBeenCalled()
    expect(manager.getStats().runtime).toMatchObject({
      completedTasks: 1,
      failedTasks: 1
    })
  })

  it('projects a synchronous runtime throw through the asynchronous task failure event', async () => {
    const manager = new AgentManager()
    await manager.init()
    const failed = vi.fn()
    manager.setTaskRuntime(
      () => {
        throw new Error('runtime admission failed')
      },
      () => false
    )
    manager.on('task:failed', failed)

    await expect(
      manager.executeTask({
        id: 'task-sync-failure',
        agentId: 'agent-safe',
        type: 'execute',
        input: null
      })
    ).resolves.toBe('task-sync-failure')
    await vi.waitFor(() =>
      expect(failed).toHaveBeenCalledWith({
        taskId: 'task-sync-failure',
        error: 'runtime admission failed'
      })
    )
    await vi.waitFor(() =>
      expect(manager.getTaskStatus('task-sync-failure')).toBe(AgentStatus.COMPLETED)
    )
    expect(failed).toHaveBeenCalledOnce()
    expect(manager.getStats().runtime).toMatchObject({ activeTasks: 0, failedTasks: 1 })
  })

  it('cleans active state without emitting another terminal event when a listener throws', async () => {
    const manager = new AgentManager()
    await manager.init()
    const failed = vi.fn()
    manager.setTaskRuntime(
      async () => createResult('task-listener-failure', AgentStatus.COMPLETED, true),
      () => false
    )
    manager.on('task:completed', () => {
      throw new Error('listener failed')
    })
    manager.on('task:failed', failed)

    await expect(
      manager.executeTask({
        id: 'task-listener-failure',
        agentId: 'agent-safe',
        type: 'execute',
        input: null
      })
    ).resolves.toBe('task-listener-failure')
    await vi.waitFor(() =>
      expect(manager.getTaskStatus('task-listener-failure')).toBe(AgentStatus.COMPLETED)
    )

    expect(failed).not.toHaveBeenCalled()
    expect(manager.getStats().runtime).toMatchObject({ activeTasks: 0, completedTasks: 1 })
  })

  it('isolates cancellation errors and drains every observer before clearing runtime state', async () => {
    const manager = new AgentManager()
    await manager.init()
    const firstExecution = createDeferred<AgentResult>()
    const secondExecution = createDeferred<AgentResult>()
    const executor = vi.fn((task: { id?: string }) =>
      task.id === 'task-shutdown-first' ? firstExecution.promise : secondExecution.promise
    )
    const cancel = vi.fn((taskId: string) => {
      if (taskId === 'task-shutdown-first') throw new Error('cancel failed')
      return true
    })
    const cancelled = vi.fn()
    manager.setTaskRuntime(executor, cancel)
    manager.on('task:cancelled', cancelled)

    await manager.executeTask({
      id: 'task-shutdown-first',
      agentId: 'agent-safe',
      type: 'execute',
      input: null
    })
    await manager.executeTask({
      id: 'task-shutdown-second',
      agentId: 'agent-safe',
      type: 'execute',
      input: null
    })

    let shutdownSettled = false
    const shutdown = manager.shutdown().then(() => {
      shutdownSettled = true
    })

    expect(cancel).toHaveBeenCalledWith('task-shutdown-first')
    expect(cancel).toHaveBeenCalledWith('task-shutdown-second')
    expect(shutdownSettled).toBe(false)
    expect(dependencyMocks.clearAgents).not.toHaveBeenCalled()
    expect(dependencyMocks.clearTools).not.toHaveBeenCalled()
    await expect(manager.cancelTask('probe-before-drain')).resolves.toBe(true)

    firstExecution.resolve(
      createResult('task-shutdown-first', AgentStatus.CANCELLED, false, 'cancelled')
    )
    await vi.waitFor(() => expect(manager.getStats().runtime.activeTasks).toBe(1))
    expect(shutdownSettled).toBe(false)
    expect(dependencyMocks.clearAgents).not.toHaveBeenCalled()
    expect(dependencyMocks.clearTools).not.toHaveBeenCalled()

    secondExecution.resolve(
      createResult('task-shutdown-second', AgentStatus.CANCELLED, false, 'cancelled')
    )
    await shutdown

    expect(cancelled).toHaveBeenCalledTimes(2)
    expect(dependencyMocks.clearAgents).toHaveBeenCalledOnce()
    expect(dependencyMocks.clearTools).toHaveBeenCalledOnce()
    expect(manager.getStats().runtime.activeTasks).toBe(0)
    await expect(manager.cancelTask('probe-after-drain')).resolves.toBe(false)
  })
})
