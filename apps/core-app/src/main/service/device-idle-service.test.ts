import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, getMainConfigMock, saveMainConfigMock, powerMonitorMock } = vi.hoisted(
  () => ({
    execFileMock: vi.fn(),
    getMainConfigMock: vi.fn(() => undefined),
    saveMainConfigMock: vi.fn(),
    powerMonitorMock: {
      getSystemIdleTime: vi.fn(() => 0),
      isOnBatteryPower: vi.fn(() => false)
    }
  })
)

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('electron', () => ({
  powerMonitor: powerMonitorMock
}))

vi.mock('../modules/storage', () => ({
  getMainConfig: getMainConfigMock,
  isMainStorageReady: vi.fn(() => true),
  saveMainConfig: saveMainConfigMock,
  subscribeMainConfig: vi.fn(() => vi.fn())
}))

vi.mock('../core/eventbus/touch-event', () => ({
  TalexEvents: {
    ALL_MODULES_LOADED: 'ALL_MODULES_LOADED'
  },
  touchEventBus: {
    once: vi.fn()
  }
}))

describe('DeviceIdleService canRun', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'))
    vi.clearAllMocks()
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    })
    getMainConfigMock.mockReturnValue(undefined)
    powerMonitorMock.getSystemIdleTime.mockReturnValue(5)
    powerMonitorMock.isOnBatteryPower.mockReturnValue(false)
    execFileMock.mockImplementation((_file, _args, callback) => {
      callback(null, '80\n')
    })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('skips battery probing when the device is not idle enough', async () => {
    const { DeviceIdleService } = await import('./device-idle-service')
    const service = DeviceIdleService.getInstance()

    const decision = await service.canRun({ idleThresholdMs: 60_000 })

    expect(decision).toEqual({
      allowed: false,
      reason: 'not-idle',
      snapshot: {
        idleMs: 5_000,
        battery: null
      }
    })
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('checks battery policy when forceAfter bypasses the idle threshold', async () => {
    const { DeviceIdleService } = await import('./device-idle-service')
    const service = DeviceIdleService.getInstance()

    const decision = await service.canRun({
      idleThresholdMs: 60_000,
      lastRunAt: Date.now() - 120_000,
      forceAfterMs: 60_000
    })

    expect(decision.allowed).toBe(true)
    expect(decision.forced).toBe(true)
    expect(decision.snapshot.idleMs).toBe(5_000)
    expect(decision.snapshot.battery).toEqual(
      expect.objectContaining({
        charging: true,
        onBattery: false
      })
    )
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('reuses recent battery status for repeated idle checks', async () => {
    const { DeviceIdleService } = await import('./device-idle-service')
    const service = DeviceIdleService.getInstance()

    powerMonitorMock.getSystemIdleTime.mockReturnValue(120)

    await service.canRun({ idleThresholdMs: 60_000 })
    await service.canRun({ idleThresholdMs: 60_000 })

    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes battery status when power source changes', async () => {
    const { DeviceIdleService } = await import('./device-idle-service')
    const service = DeviceIdleService.getInstance()

    powerMonitorMock.getSystemIdleTime.mockReturnValue(120)
    powerMonitorMock.isOnBatteryPower.mockReturnValueOnce(false).mockReturnValueOnce(true)

    await service.canRun({ idleThresholdMs: 60_000 })
    await service.canRun({ idleThresholdMs: 60_000 })

    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent battery probes', async () => {
    const { DeviceIdleService } = await import('./device-idle-service')
    const service = DeviceIdleService.getInstance()

    powerMonitorMock.getSystemIdleTime.mockReturnValue(120)

    let resolveBattery!: (stdout: string) => void
    execFileMock.mockImplementation((_file, _args, callback) => {
      resolveBattery = (stdout: string) => callback(null, stdout)
    })

    const first = service.canRun({ idleThresholdMs: 60_000 })
    const second = service.canRun({ idleThresholdMs: 60_000 })

    await Promise.resolve()
    expect(execFileMock).toHaveBeenCalledTimes(1)

    resolveBattery('80\n')

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})
