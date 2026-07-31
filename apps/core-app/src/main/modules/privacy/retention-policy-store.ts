import type { AppSetting } from '@talex-touch/utils'
import type {
  PrivacyRetentionPolicyV1,
  PrivacyRetentionSelectionV1
} from '@talex-touch/utils/transport/events/types'
import { isProxy } from 'node:util/types'
import { StorageList } from '@talex-touch/utils'
import { getMainConfig, saveMainConfigDurable } from '../storage'
import {
  normalizePrivacyRetentionPolicy,
  privacyRetentionSelectionToPolicy
} from './retention-policy'

const PRIVACY_POLICY_SECTION = 'privacyDataLifecycle'
const PRIVACY_POLICY_FIELD = 'retentionPolicy'

export interface PrivacyRetentionPolicyStorageAdapter {
  read: () => unknown | Promise<unknown>
  write: (policy: PrivacyRetentionPolicyV1) => void | Promise<void>
}

export interface PrivacyRetentionPolicyStore {
  load: () => Promise<PrivacyRetentionPolicyV1>
  save: (selection: PrivacyRetentionSelectionV1) => Promise<PrivacyRetentionPolicyV1>
}

export function createPrivacyRetentionPolicyStore(
  adapter: PrivacyRetentionPolicyStorageAdapter
): PrivacyRetentionPolicyStore {
  return Object.freeze({
    async load() {
      return normalizePrivacyRetentionPolicy(await adapter.read())
    },
    async save(selection) {
      const policy = privacyRetentionSelectionToPolicy(selection)
      await adapter.write(policy)
      return policy
    }
  })
}

function plainRecord(value: unknown): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value)) {
      return {}
    }
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function ownDataValue(record: Record<string, unknown>, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key)
    return descriptor && 'value' in descriptor ? descriptor.value : undefined
  } catch {
    return undefined
  }
}

function copyDataRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value)) {
    return null
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  const record = plainRecord(value)
  const copy: Record<string, unknown> = {}
  try {
    for (const key of Object.keys(record)) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key)
      if (descriptor && 'value' in descriptor) copy[key] = descriptor.value
    }
  } catch {
    return null
  }
  return copy
}

export function createMainPrivacyRetentionPolicyStore(): PrivacyRetentionPolicyStore {
  return createPrivacyRetentionPolicyStore({
    read() {
      const appSetting = plainRecord(getMainConfig(StorageList.APP_SETTING))
      const section = plainRecord(ownDataValue(appSetting, PRIVACY_POLICY_SECTION))
      return ownDataValue(section, PRIVACY_POLICY_FIELD)
    },
    async write(policy) {
      const appSetting = copyDataRecord(getMainConfig(StorageList.APP_SETTING))
      if (!appSetting) throw new Error('PRIVACY_RETENTION_POLICY_PERSIST_FAILED')
      const section = copyDataRecord(ownDataValue(appSetting, PRIVACY_POLICY_SECTION))
      if (!section) throw new Error('PRIVACY_RETENTION_POLICY_PERSIST_FAILED')
      const next = {
        ...appSetting,
        [PRIVACY_POLICY_SECTION]: {
          ...section,
          [PRIVACY_POLICY_FIELD]: policy
        }
      } as unknown as AppSetting
      const result = await saveMainConfigDurable(StorageList.APP_SETTING, next, { force: true })
      if (!result.success) throw new Error('PRIVACY_RETENTION_POLICY_PERSIST_FAILED')
    }
  })
}
