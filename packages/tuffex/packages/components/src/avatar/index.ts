import TxAvatarComponent from './src/TxAvatar.vue'
import TxAvatarGroupComponent from './src/TxAvatarGroup.vue'
import { withInstall } from '../../../utils/withInstall'
import type { AvatarEmits, AvatarGroupProps, AvatarProps, AvatarSize, AvatarStatus } from './src/types'

const TxAvatar = withInstall(TxAvatarComponent)
const TxAvatarGroup = withInstall(TxAvatarGroupComponent)

export { TxAvatar, TxAvatarGroup }
export type { AvatarEmits, AvatarGroupProps, AvatarProps, AvatarSize, AvatarStatus }
export type TxAvatarInstance = InstanceType<typeof TxAvatarComponent>
export type TxAvatarGroupInstance = InstanceType<typeof TxAvatarGroupComponent>

export default TxAvatar
