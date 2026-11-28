import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const registrarMocks = vi.hoisted(() => ({
  registerDp1Ports: vi.fn(),
  registerDp2Ports: vi.fn(),
  registerDp3Ports: vi.fn(),
  registerDp4Ports: vi.fn(),
  registerDp5Dp7Ports: vi.fn()
}))

vi.mock('./register-dp1-ports', () => ({
  registerDp1Ports: registrarMocks.registerDp1Ports
}))
vi.mock('./register-dp2-ports', () => ({
  registerDp2Ports: registrarMocks.registerDp2Ports
}))
vi.mock('./register-dp3-ports', () => ({
  registerDp3Ports: registrarMocks.registerDp3Ports
}))
vi.mock('./register-dp4-ports', () => ({
  registerDp4Ports: registrarMocks.registerDp4Ports
}))
vi.mock('./register-dp5-dp7-ports', () => ({
  registerDp5Dp7Ports: registrarMocks.registerDp5Dp7Ports
}))

import { registerAllAxiomaticPorts } from './index'

describe('registerAllAxiomaticPorts composition root', () => {
  it('registers DP1..DP7 ports in domain order and is idempotent across repeated calls', () => {
    const callOrder: string[] = []
    registrarMocks.registerDp1Ports.mockImplementation(() => {
      callOrder.push('dp1')
    })
    registrarMocks.registerDp2Ports.mockImplementation(() => {
      callOrder.push('dp2')
    })
    registrarMocks.registerDp3Ports.mockImplementation(() => {
      callOrder.push('dp3')
    })
    registrarMocks.registerDp4Ports.mockImplementation(() => {
      callOrder.push('dp4')
    })
    registrarMocks.registerDp5Dp7Ports.mockImplementation(() => {
      callOrder.push('dp5-dp7')
    })

    registerAllAxiomaticPorts()
    registerAllAxiomaticPorts()

    expect(callOrder).toEqual(['dp1', 'dp2', 'dp3', 'dp4', 'dp5-dp7'])
    expect(registrarMocks.registerDp1Ports).toHaveBeenCalledTimes(1)
    expect(registrarMocks.registerDp2Ports).toHaveBeenCalledTimes(1)
    expect(registrarMocks.registerDp3Ports).toHaveBeenCalledTimes(1)
    expect(registrarMocks.registerDp4Ports).toHaveBeenCalledTimes(1)
    expect(registrarMocks.registerDp5Dp7Ports).toHaveBeenCalledTimes(1)
  })

  it('is invoked in main/index.ts before readStartupAppConfig, fileProtocolModule.onInit, and loadStartupModules', () => {
    const mainIndexSource = readFileSync(path.resolve(__dirname, '../../index.ts'), 'utf8')
    const portsCallIndex = mainIndexSource.indexOf('registerAllAxiomaticPorts()')
    const readStartupIndex = mainIndexSource.indexOf('readStartupAppConfig(')
    const fileProtocolInitIndex = mainIndexSource.indexOf('fileProtocolModule.onInit()')
    const loadStartupIndex = mainIndexSource.indexOf('loadStartupModules(')

    expect(portsCallIndex).toBeGreaterThan(-1)
    expect(readStartupIndex).toBeGreaterThan(portsCallIndex)
    expect(fileProtocolInitIndex).toBeGreaterThan(portsCallIndex)
    expect(loadStartupIndex).toBeGreaterThan(portsCallIndex)
  })
})
