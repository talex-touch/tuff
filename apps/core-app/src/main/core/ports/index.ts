import { registerDp1Ports } from './register-dp1-ports'
import { registerDp2Ports } from './register-dp2-ports'
import { registerDp3Ports } from './register-dp3-ports'
import { registerDp4Ports } from './register-dp4-ports'
import { registerDp5Dp7Ports } from './register-dp5-dp7-ports'

export {
  registerDp1Ports,
  registerDp2Ports,
  registerDp3Ports,
  registerDp4Ports,
  registerDp5Dp7Ports
}

let allPortsRegistered = false

/**
 * Composition-root bootstrap wiring all MIT Axiomatic Design Dependency Inversion ports
 * across DP1 (Persistence) through DP7 (Surface).
 *
 * Must be invoked once during main-process startup before `readStartupAppConfig`,
 * `fileProtocolModule.onInit()`, and `loadStartupModules()`. Idempotent across repeated calls.
 */
export function registerAllAxiomaticPorts(): void {
  if (allPortsRegistered) {
    return
  }
  allPortsRegistered = true

  registerDp1Ports()
  registerDp2Ports()
  registerDp3Ports()
  registerDp4Ports()
  registerDp5Dp7Ports()
}
