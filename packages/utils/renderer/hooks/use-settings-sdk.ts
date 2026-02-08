import { useTuffTransport } from '../../transport'
import { createSettingsSdk } from '../../transport/sdk/domains/settings'

export function useSettingsSdk() {
  const transport = useTuffTransport()
  return createSettingsSdk(transport)
}
