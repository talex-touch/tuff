import { createLogger } from '../../utils/logger'

const flowBusLog = createLogger('FlowBus')

export const flowBusDispatchLog = flowBusLog.child('Dispatch')
export const flowBusIpcLog = flowBusLog.child('IPC')
export const flowBusModuleLog = flowBusLog.child('Module')
export const flowBusSessionLog = flowBusLog.child('Session')
export const flowBusTargetLog = flowBusLog.child('TargetRegistry')
