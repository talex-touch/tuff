import { createLogger } from '../../utils/logger'

const divisionBoxLog = createLogger('DivisionBox')

export const divisionBoxCommandProviderLog = divisionBoxLog.child('CommandProvider')
export const divisionBoxFlowTriggerLog = divisionBoxLog.child('FlowTrigger')
export const divisionBoxIpcLog = divisionBoxLog.child('IPC')
export const divisionBoxLruLog = divisionBoxLog.child('LRU')
export const divisionBoxManagerLog = divisionBoxLog.child('Manager')
export const divisionBoxModuleLog = divisionBoxLog.child('Module')
export const divisionBoxShortcutLog = divisionBoxLog.child('ShortcutTrigger')
