import type {
  TxVersionBuild,
  TxVersionCapsulePanel,
  TxVersionCapsulePanelSlotProps,
  TxVersionCapsuleProps,
  TxVersionChannelTone,
  TxVersionDownloadPanelProps,
  TxVersionHistoryEntry,
  TxVersionHistoryPanelProps,
  TxVersionNotice,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxVersionCapsule from './src/TxVersionCapsule.vue'
import TxVersionDownloadPanel from './src/TxVersionDownloadPanel.vue'
import TxVersionHistoryPanel from './src/TxVersionHistoryPanel.vue'

const VersionCapsule = withInstall(TxVersionCapsule)
const VersionDownloadPanel = withInstall(TxVersionDownloadPanel)
const VersionHistoryPanel = withInstall(TxVersionHistoryPanel)

export {
  TxVersionCapsule,
  TxVersionDownloadPanel,
  TxVersionHistoryPanel,
  VersionCapsule,
  VersionDownloadPanel,
  VersionHistoryPanel,
}

export type {
  TxVersionBuild,
  TxVersionCapsulePanel,
  TxVersionCapsulePanelSlotProps,
  TxVersionCapsuleProps,
  TxVersionChannelTone,
  TxVersionDownloadPanelProps,
  TxVersionHistoryEntry,
  TxVersionHistoryPanelProps,
  TxVersionNotice,
}

export type TxVersionCapsuleInstance = InstanceType<typeof TxVersionCapsule>
export type TxVersionDownloadPanelInstance = InstanceType<typeof TxVersionDownloadPanel>
export type TxVersionHistoryPanelInstance = InstanceType<typeof TxVersionHistoryPanel>

export default VersionCapsule
