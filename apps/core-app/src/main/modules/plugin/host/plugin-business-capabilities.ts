import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { NetworkRequestOptions, NetworkResponse } from '@talex-touch/utils/network'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { BlockList, isIP } from 'node:net'
import { types as utilTypes } from 'node:util'
import {
  normalizePluginSqlForExecution,
  validatePluginSql,
  validatePluginTransactionStatements
} from '../runtime/plugin-sql-policy'
import type {
  PluginSqliteOwnerIdentity,
  PluginSqliteResourceClient
} from '../runtime/plugin-sqlite-resource-owner'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'

export type PluginBusinessItemScope = 'active-feature' | 'root-results'
export type PluginBusinessDto =
  | null
  | boolean
  | number
  | string
  | readonly PluginBusinessDto[]
  | { readonly [key: string]: PluginBusinessDto }
export type PluginBusinessItemDto = Readonly<Record<string, PluginBusinessDto>>

export type PluginBusinessClipboardReadRequest =
  | { readonly op: 'text' }
  | { readonly op: 'snapshot' }
export type PluginBusinessClipboardReadResult =
  | { readonly op: 'text'; readonly text: string }
  | {
      readonly op: 'snapshot'
      readonly text: string
      readonly html: string
      readonly hasImage: boolean
      readonly hasFiles: boolean
      readonly formats: readonly string[]
    }
export type PluginBusinessClipboardWriteRequest =
  | {
      readonly op: 'write'
      readonly content: {
        readonly text?: string
        readonly html?: string
        readonly image?: string
        readonly files?: readonly string[]
      }
    }
  | { readonly op: 'clear' }
export interface PluginBusinessClipboardCopyRequest {
  readonly text?: string
  readonly html?: string
  readonly image?: string
  readonly files?: readonly string[]
  readonly delayMs?: number
  readonly hideCoreBox?: boolean
}
export interface PluginBusinessClipboardCopyResult {
  readonly success: boolean
  readonly code?: string
}

export interface PluginBusinessItemReplacement {
  readonly id: string
  readonly activation: PluginActivationIdentity
}

export interface PluginBusinessFeatureHost {
  pushItems(
    scope: PluginBusinessItemScope,
    items: readonly PluginBusinessItemDto[],
    signal: AbortSignal,
    replacements?: readonly PluginBusinessItemReplacement[]
  ): void | Promise<void>
  updateItem(
    scope: PluginBusinessItemScope,
    id: string,
    patch: PluginBusinessItemDto,
    signal: AbortSignal
  ): boolean | Promise<boolean>
  removeItem(id: string, signal: AbortSignal): boolean | Promise<boolean>
  clearItems(signal: AbortSignal): number | Promise<number>
  listItems(
    signal: AbortSignal
  ): readonly PluginBusinessItemDto[] | Promise<readonly PluginBusinessItemDto[]>
}

export interface PluginBusinessRuntimeInfoDto {
  readonly name: string
  readonly displayName: string
  readonly version: string
  readonly description: string
  readonly status: string
  readonly sdkapi: number
  readonly category?: string
}

export interface PluginBusinessPlugin {
  readonly name: string
  readonly sdkapi?: number
  getActivationIdentity(): PluginActivationIdentity
  getBusinessRuntimeInfo(): PluginBusinessRuntimeInfoDto
  getDataPath(): string
  createBusinessFeatureHost(activation: PluginActivationIdentity): PluginBusinessFeatureHost
  addBusinessFeature(feature: IPluginFeature): boolean | Promise<boolean>
  removeBusinessFeature(featureId: string): boolean | Promise<boolean>
  listBusinessFeatures(): readonly IPluginFeature[]
  readBusinessFile(
    name: string
  ):
    | { readonly found: false }
    | { readonly found: true; readonly value: PluginBusinessDto }
    | Promise<
        { readonly found: false } | { readonly found: true; readonly value: PluginBusinessDto }
      >
  writeBusinessFile(name: string, value: PluginBusinessDto): void | Promise<void>
  removeBusinessFile(name: string): boolean | Promise<boolean>
  listBusinessFiles(): readonly string[] | Promise<readonly string[]>
  cleanupBusinessItems(
    activation: PluginActivationIdentity,
    ids: readonly string[]
  ): void | Promise<void>
}

export interface PluginBusinessClipboardHostService {
  read(
    request: PluginBusinessClipboardReadRequest,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): PluginBusinessClipboardReadResult | Promise<PluginBusinessClipboardReadResult>
  write(
    request: PluginBusinessClipboardWriteRequest,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): void | Promise<void>
  copyAndPaste(
    request: PluginBusinessClipboardCopyRequest,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): PluginBusinessClipboardCopyResult | Promise<PluginBusinessClipboardCopyResult>
}

export interface PluginBusinessSqliteOwners {
  acquire(
    identity: PluginSqliteOwnerIdentity,
    dataPath: string
  ): Promise<PluginSqliteResourceClient>
  closeActivation(identity: PluginSqliteOwnerIdentity): Promise<boolean>
}

export interface PluginBusinessSecureStore {
  get(rootPath: string, key: string): Promise<string | null>
  set(rootPath: string, key: string, value: string | null): Promise<boolean>
}

export interface PluginBusinessNetworkService {
  requestPinned?(
    options: NetworkRequestOptions,
    policy: {
      readonly resolvedAddresses: readonly string[]
      readonly maxResponseBytes: number
    }
  ): Promise<NetworkResponse>
  resolveAddresses(hostname: string): Promise<readonly string[]>
}

export interface PluginBusinessExternalUrlDecision {
  readonly allowed: boolean
  readonly url?: string
  readonly protocol?: string
}

export interface PluginBusinessCapabilityOptions {
  resolvePlugin(pluginName: string): PluginBusinessPlugin | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  hasPermission(pluginName: string, permissionId: string, sdkapi: number): boolean
  sqliteOwners: PluginBusinessSqliteOwners
  secureStoreRootPath: string
  secureStore: PluginBusinessSecureStore
  clipboard: PluginBusinessClipboardHostService
  openUrl(url: string): Promise<PluginBusinessExternalUrlDecision>
  network: PluginBusinessNetworkService
}

export interface PluginBusinessCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  closeActivation(activation: PluginActivationIdentity): Promise<void>
  closeAll(): Promise<void>
}

interface BusinessActor {
  readonly activation: PluginActivationIdentity
  readonly hostGeneration: number
  readonly plugin: PluginBusinessPlugin
  readonly context: PluginSecurityContext
  readonly record: ActivationRecord
}

interface ActivationRecord {
  readonly activation: PluginActivationIdentity
  readonly hostGeneration: number
  readonly plugin: PluginBusinessPlugin
  readonly featureHost: PluginBusinessFeatureHost
  readonly featureIds: Set<string>
  readonly itemIds: Set<string>
  closed: boolean
}

const MAX_ITEMS_PER_PUSH = 100
const MAX_ITEMS_PER_LIST = 1_000
const MAX_ITEM_DEPTH = 12
const MAX_ITEM_MEMBERS = 1_024
const MAX_ITEM_STRING_BYTES = 64 * 1024
const MAX_TEXT_BYTES = 64 * 1024
const MAX_HTML_BYTES = 256 * 1024
const MAX_IMAGE_BYTES = 512 * 1024
const MAX_FILES = 64
const MAX_FILE_BYTES = 4_096
const MAX_FORMATS = 128
const MAX_IDENTIFIER_BYTES = 256
const MAX_FILE_NAME_BYTES = 128
const MAX_FILE_JSON_BYTES = 1024 * 1024
const MAX_SECRET_BYTES = 64 * 1024
const MAX_HTTP_URL_BYTES = 4_096
const MAX_HTTP_HEADERS = 64
const MAX_HTTP_HEADER_BYTES = 8 * 1024
const MAX_HTTP_QUERY = 64
const MAX_HTTP_BODY_BYTES = 256 * 1024
const MAX_HTTP_RESULT_BYTES = 1024 * 1024
const MAX_HTTP_RESPONSE_BYTES = 768 * 1024
const MAX_ITEM_BATCH_BYTES = 1024 * 1024
const MAX_WIDGET_ITEM_STRING_BYTES = 768 * 1024
const MAX_WIDGET_ITEM_MEMBERS = 4_096
const MAX_FEATURES = 256
const MAX_FEATURE_COMMANDS = 64
const MAX_FEATURE_KEYWORDS = 64
const MAX_SQL_PARAMS = 256
const MAX_SQL_PARAM_BYTES = 1024 * 1024
const FIXED_WIDGET_NAVIGATION = Object.freeze({
  'open-intelligence-settings': Object.freeze({
    pluginName: 'touch-intelligence',
    path: '/intelligence/channels'
  }),
  'open-plugin-permissions': Object.freeze({
    pluginName: 'touch-intelligence',
    path: '/plugin/touch-intelligence?tab=Permissions'
  })
})
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor', '__tuffHostWire'])
const ITEM_KEYS = new Set(['id', 'source', 'kind', 'actions', 'meta', 'render', 'scoring'])
const WIDGET_ITEM_KEYS = new Set(['id', 'source', 'actions', 'meta', 'render'])
const ITEM_PATCH_KEYS = new Set([...ITEM_KEYS].filter((key) => key !== 'id'))
const ITEM_SOURCE_KEYS = ['type', 'id', 'name', 'version'] as const
const ITEM_RENDER_KEYS = ['mode', 'basic'] as const
const ITEM_WIDGET_RENDER_KEYS = ['mode', 'basic', 'custom'] as const
const ITEM_WIDGET_CUSTOM_KEYS = ['type', 'content', 'data'] as const
const ITEM_BASIC_KEYS = ['title', 'subtitle', 'description', 'icon', 'tags', 'accessory'] as const
const ITEM_ICON_KEYS = ['type', 'value', 'color', 'colorful'] as const
const ITEM_ACTION_KEYS = [
  'id',
  'type',
  'label',
  'description',
  'icon',
  'shortcut',
  'payload',
  'primary'
] as const
const ITEM_META_KEYS = [
  'pluginName',
  'featureId',
  'searchProviderId',
  'defaultAction',
  'priority'
] as const
const ITEM_WIDGET_META_KEYS = [
  ...ITEM_META_KEYS,
  'actionId',
  'status',
  'pluginType',
  'keepCoreBoxOpen',
  'payload',
  'intelligence'
] as const
const ITEM_SCORING_KEYS = [
  'base',
  'match',
  'frequency',
  'recency',
  'ai',
  'final',
  'priority'
] as const
const FEATURE_KEYS = [
  'id',
  'name',
  'desc',
  'icon',
  'keywords',
  'push',
  'platform',
  'commands',
  'interaction',
  'priority',
  'experimental',
  'acceptedInputTypes',
  'omniTransfer',
  'footerHints'
] as const
const FEATURE_COMMAND_TYPES = new Set([
  'match',
  'contain',
  'regex',
  'over',
  'image',
  'files',
  'directory',
  'window'
])
const FEATURE_INPUT_TYPES = new Set(['text', 'image', 'files', 'html'])
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const HTTP_RESPONSE_TYPES = new Set(['json', 'text', 'bytes'])
const HTTP_FORBIDDEN_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])
const HTTP_STATUSES = Object.freeze(Array.from({ length: 500 }, (_, index) => index + 100))
const PRIVATE_NETWORKS = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  PRIVATE_NETWORKS.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  PRIVATE_NETWORKS.addSubnet(network, prefix, 'ipv6')
}
const STABLE_CODE = /^[A-Z][A-Z0-9_]{0,127}$/
const PERMISSION_ID = /^[a-z][a-z0-9.-]{0,127}$/
const SECRET_KEY = /^[a-z0-9._-]{1,48}$/i
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function invalid(): never {
  throw new TypeError('PLUGIN_BUSINESS_CAPABILITY_INVALID')
}

function authorityInvalid(): never {
  throw new Error('PLUGIN_BUSINESS_CAPABILITY_AUTHORITY_INVALID')
}

function unavailable(): never {
  throw new Error('PLUGIN_BUSINESS_CAPABILITY_UNAVAILABLE')
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function boundedString(value: unknown, maximumBytes: number, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    utf8Bytes(value) > maximumBytes
  ) {
    invalid()
  }
  return value
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const allowed = new Set(keys)
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !allowed.has(key))) {
    invalid()
  }
  const output: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (!descriptor) continue
    if (!descriptor.enumerable || !('value' in descriptor)) invalid()
    output[key] = descriptor.value
  }
  return output
}

function dynamicRecord(value: unknown, maximumKeys: number): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length > maximumKeys) invalid()
  const output: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) invalid()
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output[key] = descriptor.value
  }
  return output
}

function requiredField(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) invalid()
  return record[key]
}

function snapshotArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) invalid()
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    invalid()
  }
  const lengthDescriptor = descriptors.length
  const length =
    lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maximum) invalid()
  const allowedKeys = new Set<PropertyKey>(['length'])
  const output: unknown[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowedKeys.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) invalid()
  return output
}

interface CloneBudget {
  members: number
  stringBytes: number
}

interface CloneOptions {
  readonly maxDepth: number
  readonly maxMembers: number
  readonly maxStringBytes: number
  readonly allowedTopLevelKeys?: ReadonlySet<string>
  readonly requireItemId?: boolean
}

function cloneDto(
  value: unknown,
  options: CloneOptions,
  ancestors = new WeakSet<object>(),
  budget: CloneBudget = { members: 0, stringBytes: 0 },
  depth = 0
): PluginBusinessDto {
  if (depth > options.maxDepth) invalid()
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid()
    return value
  }
  if (typeof value === 'string') {
    budget.stringBytes += utf8Bytes(value)
    if (budget.stringBytes > options.maxStringBytes) invalid()
    return value
  }
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) invalid()
  if (ancestors.has(value)) invalid()
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const entries = snapshotArray(value, options.maxMembers)
      budget.members += entries.length
      if (budget.members > options.maxMembers) invalid()
      return entries.map((entry) => cloneDto(entry, options, ancestors, budget, depth + 1))
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) invalid()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const output: Record<string, PluginBusinessDto> = Object.create(null)
    const keys = Reflect.ownKeys(descriptors)
    budget.members += keys.length
    if (budget.members > options.maxMembers) invalid()
    for (const key of keys) {
      if (
        typeof key !== 'string' ||
        FORBIDDEN_KEYS.has(key) ||
        (depth === 0 && options.allowedTopLevelKeys && !options.allowedTopLevelKeys.has(key))
      ) {
        invalid()
      }
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
      budget.stringBytes += utf8Bytes(key)
      if (budget.stringBytes > options.maxStringBytes) invalid()
      output[key] = cloneDto(descriptor.value, options, ancestors, budget, depth + 1)
    }
    if (depth === 0 && options.requireItemId) {
      boundedString(output.id, MAX_IDENTIFIER_BYTES)
    }
    return output
  } finally {
    ancestors.delete(value)
  }
}

function validateOptionalItemString(
  record: Record<string, unknown>,
  key: string,
  maximumBytes = 4_096
): void {
  if (Object.hasOwn(record, key)) boundedString(record[key], maximumBytes, true)
}

function validateItemIcon(value: unknown): void {
  const icon = exactRecord(value, ITEM_ICON_KEYS)
  const type = requiredField(icon, 'type')
  if (type !== 'class' && type !== 'emoji') invalid()
  boundedString(requiredField(icon, 'value'), 4_096)
  validateOptionalItemString(icon, 'color', 128)
  if (Object.hasOwn(icon, 'colorful') && typeof icon.colorful !== 'boolean') invalid()
}

function validateItemShape(item: PluginBusinessItemDto, patch: boolean): void {
  const record = exactRecord(item, patch ? [...ITEM_PATCH_KEYS] : [...ITEM_KEYS])
  if (!patch) boundedString(requiredField(record, 'id'), MAX_IDENTIFIER_BYTES)
  if (!patch || Object.hasOwn(record, 'source')) {
    const source = exactRecord(requiredField(record, 'source'), ITEM_SOURCE_KEYS)
    if (requiredField(source, 'type') !== 'plugin') invalid()
    boundedString(requiredField(source, 'id'), MAX_IDENTIFIER_BYTES)
    validateOptionalItemString(source, 'name', MAX_IDENTIFIER_BYTES)
    validateOptionalItemString(source, 'version', MAX_IDENTIFIER_BYTES)
  }
  if (Object.hasOwn(record, 'kind')) boundedString(record.kind, MAX_IDENTIFIER_BYTES)
  if (Object.hasOwn(record, 'actions')) {
    const actionIds = new Set<string>()
    for (const value of snapshotArray(record.actions, 16)) {
      const action = exactRecord(value, ITEM_ACTION_KEYS)
      const id = boundedString(requiredField(action, 'id'), MAX_IDENTIFIER_BYTES)
      if (actionIds.has(id) || requiredField(action, 'type') !== 'plugin') invalid()
      actionIds.add(id)
      validateOptionalItemString(action, 'label')
      validateOptionalItemString(action, 'description')
      validateOptionalItemString(action, 'shortcut', 256)
      if (Object.hasOwn(action, 'icon')) validateItemIcon(action.icon)
      if (Object.hasOwn(action, 'primary') && typeof action.primary !== 'boolean') invalid()
    }
  }
  if (Object.hasOwn(record, 'meta')) {
    const meta = exactRecord(record.meta, ITEM_META_KEYS)
    for (const key of ['pluginName', 'featureId', 'searchProviderId', 'defaultAction']) {
      validateOptionalItemString(meta, key, MAX_IDENTIFIER_BYTES)
    }
    if (
      Object.hasOwn(meta, 'priority') &&
      (typeof meta.priority !== 'number' || !Number.isFinite(meta.priority))
    ) {
      invalid()
    }
  }
  if (!patch || Object.hasOwn(record, 'render')) {
    const render = exactRecord(requiredField(record, 'render'), ITEM_RENDER_KEYS)
    if (!patch || Object.hasOwn(render, 'mode')) {
      if (requiredField(render, 'mode') !== 'default') invalid()
    }
    if (!patch || Object.hasOwn(render, 'basic')) {
      const basic = exactRecord(requiredField(render, 'basic'), ITEM_BASIC_KEYS)
      if (!patch || Object.hasOwn(basic, 'title')) {
        boundedString(requiredField(basic, 'title'), 4_096)
      }
      validateOptionalItemString(basic, 'subtitle')
      validateOptionalItemString(basic, 'description')
      validateOptionalItemString(basic, 'accessory')
      if (Object.hasOwn(basic, 'icon')) validateItemIcon(basic.icon)
      if (Object.hasOwn(basic, 'tags')) {
        for (const value of snapshotArray(basic.tags, 16)) {
          const tag = exactRecord(value, ['text', 'color', 'variant'])
          boundedString(requiredField(tag, 'text'), 1_024)
          validateOptionalItemString(tag, 'color', 128)
          if (
            Object.hasOwn(tag, 'variant') &&
            tag.variant !== 'filled' &&
            tag.variant !== 'outlined' &&
            tag.variant !== 'ghost'
          ) {
            invalid()
          }
        }
      }
    }
  }
  if (Object.hasOwn(record, 'scoring')) {
    const scoring = exactRecord(record.scoring, ITEM_SCORING_KEYS)
    for (const key of ITEM_SCORING_KEYS) {
      if (!Object.hasOwn(scoring, key)) continue
      const score = scoring[key]
      if (typeof score !== 'number' || !Number.isFinite(score)) invalid()
      if (key !== 'priority' && (score < 0 || score > 1)) invalid()
    }
  }
}

function cloneItem(value: unknown, patch = false): PluginBusinessItemDto {
  const item = cloneDto(value, {
    maxDepth: MAX_ITEM_DEPTH,
    maxMembers: MAX_ITEM_MEMBERS,
    maxStringBytes: MAX_ITEM_STRING_BYTES,
    allowedTopLevelKeys: patch ? ITEM_PATCH_KEYS : ITEM_KEYS,
    requireItemId: !patch
  }) as PluginBusinessItemDto
  validateItemShape(item, patch)
  return item
}

function validateInternalNavigationPath(value: unknown): string {
  const path = boundedString(value, 4_096)
  if (path[0] !== '/' || path.startsWith('//') || path.includes('\\')) invalid()
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index)
    if (code < 32 || code === 127) invalid()
  }
  return path
}

function validateWidgetItemShape(item: PluginBusinessItemDto): void {
  const record = exactRecord(item, [...WIDGET_ITEM_KEYS])
  boundedString(requiredField(record, 'id'), MAX_IDENTIFIER_BYTES)

  const source = exactRecord(requiredField(record, 'source'), ITEM_SOURCE_KEYS)
  if (requiredField(source, 'type') !== 'plugin') invalid()
  boundedString(requiredField(source, 'id'), MAX_IDENTIFIER_BYTES)
  validateOptionalItemString(source, 'name', MAX_IDENTIFIER_BYTES)
  validateOptionalItemString(source, 'version', MAX_IDENTIFIER_BYTES)

  if (Object.hasOwn(record, 'actions')) {
    const actionIds = new Set<string>()
    for (const value of snapshotArray(record.actions, 16)) {
      const action = exactRecord(value, ITEM_ACTION_KEYS)
      const id = boundedString(requiredField(action, 'id'), MAX_IDENTIFIER_BYTES)
      const type = requiredField(action, 'type')
      if (actionIds.has(id) || (type !== 'plugin' && type !== 'navigate')) invalid()
      actionIds.add(id)
      validateOptionalItemString(action, 'label')
      validateOptionalItemString(action, 'description')
      validateOptionalItemString(action, 'shortcut', 256)
      if (Object.hasOwn(action, 'icon')) validateItemIcon(action.icon)
      if (Object.hasOwn(action, 'primary') && typeof action.primary !== 'boolean') invalid()
      if (type === 'navigate') {
        const payload = exactRecord(requiredField(action, 'payload'), ['path'])
        validateInternalNavigationPath(requiredField(payload, 'path'))
      } else if (Object.hasOwn(action, 'payload')) {
        const payload = action.payload
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid()
      }
    }
  }

  const meta = exactRecord(requiredField(record, 'meta'), ITEM_WIDGET_META_KEYS)
  for (const key of [
    'pluginName',
    'featureId',
    'searchProviderId',
    'defaultAction',
    'actionId',
    'status',
    'pluginType'
  ]) {
    validateOptionalItemString(meta, key, MAX_IDENTIFIER_BYTES)
  }
  boundedString(requiredField(meta, 'pluginName'), MAX_IDENTIFIER_BYTES)
  boundedString(requiredField(meta, 'featureId'), MAX_IDENTIFIER_BYTES)
  if (
    Object.hasOwn(meta, 'priority') &&
    (typeof meta.priority !== 'number' || !Number.isFinite(meta.priority))
  ) {
    invalid()
  }
  if (Object.hasOwn(meta, 'keepCoreBoxOpen') && typeof meta.keepCoreBoxOpen !== 'boolean') {
    invalid()
  }
  for (const key of ['payload', 'intelligence']) {
    if (!Object.hasOwn(meta, key)) continue
    const value = meta[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  }

  const render = exactRecord(requiredField(record, 'render'), ITEM_WIDGET_RENDER_KEYS)
  if (requiredField(render, 'mode') !== 'custom') invalid()
  const basic = exactRecord(requiredField(render, 'basic'), ITEM_BASIC_KEYS)
  boundedString(requiredField(basic, 'title'), 4_096)
  validateOptionalItemString(basic, 'subtitle')
  validateOptionalItemString(basic, 'description')
  validateOptionalItemString(basic, 'accessory')
  if (Object.hasOwn(basic, 'icon')) validateItemIcon(basic.icon)
  if (Object.hasOwn(basic, 'tags')) {
    for (const value of snapshotArray(basic.tags, 16)) {
      const tag = exactRecord(value, ['text', 'color', 'variant'])
      boundedString(requiredField(tag, 'text'), 1_024)
      validateOptionalItemString(tag, 'color', 128)
      if (
        Object.hasOwn(tag, 'variant') &&
        tag.variant !== 'filled' &&
        tag.variant !== 'outlined' &&
        tag.variant !== 'ghost'
      ) {
        invalid()
      }
    }
  }

  const custom = exactRecord(requiredField(render, 'custom'), ITEM_WIDGET_CUSTOM_KEYS)
  if (requiredField(custom, 'type') !== 'vue') invalid()
  boundedString(requiredField(custom, 'content'), 2 * MAX_IDENTIFIER_BYTES)
  const data = requiredField(custom, 'data')
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalid()
}

function cloneWidgetItem(value: unknown): PluginBusinessItemDto {
  const item = cloneDto(value, {
    maxDepth: 16,
    maxMembers: MAX_WIDGET_ITEM_MEMBERS,
    maxStringBytes: MAX_WIDGET_ITEM_STRING_BYTES,
    allowedTopLevelKeys: WIDGET_ITEM_KEYS,
    requireItemId: true
  }) as PluginBusinessItemDto
  validateWidgetItemShape(item)
  return item
}

function validateWidgetPush(value: unknown): {
  readonly scope: 'active-feature'
  readonly items: readonly PluginBusinessItemDto[]
} {
  const record = exactRecord(value, ['scope', 'items'])
  if (requiredField(record, 'scope') !== 'active-feature') invalid()
  const output = Object.freeze({
    scope: 'active-feature' as const,
    items: Object.freeze(
      snapshotArray(requiredField(record, 'items'), MAX_ITEMS_PER_PUSH).map((item) =>
        cloneWidgetItem(item)
      )
    )
  })
  assertSerializedBytes(output, MAX_ITEM_BATCH_BYTES)
  return output
}

function assertSerializedBytes(value: unknown, maximumBytes: number): void {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    invalid()
  }
  if (utf8Bytes(serialized) > maximumBytes) invalid()
}

function cloneFileJson(value: unknown): PluginBusinessDto {
  const cloned = cloneDto(value, {
    maxDepth: 24,
    maxMembers: 10_000,
    maxStringBytes: MAX_FILE_JSON_BYTES
  })
  let serialized: string
  try {
    serialized = JSON.stringify(cloned)
  } catch {
    invalid()
  }
  if (utf8Bytes(serialized) > MAX_FILE_JSON_BYTES) invalid()
  return cloned
}

function snapshotActivation(input: unknown): PluginActivationIdentity {
  const record = exactRecord(input, ['name', 'pluginInstanceId', 'activationGeneration', 'key'])
  const activationGeneration = requiredField(record, 'activationGeneration')
  if (!Number.isSafeInteger(activationGeneration) || Number(activationGeneration) < 1) invalid()
  return Object.freeze({
    name: boundedString(requiredField(record, 'name'), MAX_IDENTIFIER_BYTES),
    pluginInstanceId: boundedString(
      requiredField(record, 'pluginInstanceId'),
      MAX_IDENTIFIER_BYTES
    ),
    activationGeneration: Number(activationGeneration),
    key: boundedString(requiredField(record, 'key'), MAX_IDENTIFIER_BYTES)
  })
}

function sameActivation(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return (
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

function activationRecordKey(activation: PluginActivationIdentity): string {
  return `${activation.name}\u0000${activation.pluginInstanceId}\u0000${activation.activationGeneration}`
}

function ownerItemKey(pluginName: string, id: string): string {
  return `${pluginName}\u0000${id}`
}

function readMethod(input: unknown, key: string): (...args: unknown[]) => unknown {
  if (
    !input ||
    (typeof input !== 'object' && typeof input !== 'function') ||
    utilTypes.isProxy(input)
  ) {
    invalid()
  }
  let cursor: object | null = input as object
  const visited = new Set<object>()
  try {
    while (cursor) {
      if (visited.has(cursor) || utilTypes.isProxy(cursor)) invalid()
      visited.add(cursor)
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key)
      if (descriptor) {
        if (
          !('value' in descriptor) ||
          typeof descriptor.value !== 'function' ||
          utilTypes.isProxy(descriptor.value) ||
          /^class\s/.test(Function.prototype.toString.call(descriptor.value))
        ) {
          invalid()
        }
        return descriptor.value as (...args: unknown[]) => unknown
      }
      cursor = Object.getPrototypeOf(cursor)
    }
  } catch {
    invalid()
  }
  invalid()
}

function snapshotFeatureHost(input: unknown): PluginBusinessFeatureHost {
  const pushItems = readMethod(input, 'pushItems')
  const updateItem = readMethod(input, 'updateItem')
  const removeItem = readMethod(input, 'removeItem')
  const clearItems = readMethod(input, 'clearItems')
  const listItems = readMethod(input, 'listItems')
  return Object.freeze({
    pushItems: (scope, items, signal, replacements) =>
      pushItems.call(input, scope, items, signal, replacements) as never,
    updateItem: (scope, id, patch, signal) =>
      updateItem.call(input, scope, id, patch, signal) as never,
    removeItem: (id, signal) => removeItem.call(input, id, signal) as never,
    clearItems: (signal) => clearItems.call(input, signal) as never,
    listItems: (signal) => listItems.call(input, signal) as never
  })
}

function snapshotSqliteClient(input: unknown): PluginSqliteResourceClient {
  const execute = readMethod(input, 'execute')
  const query = readMethod(input, 'query')
  const transaction = readMethod(input, 'transaction')
  const close = readMethod(input, 'close')
  return Object.freeze({
    execute: (sql, params) =>
      execute.call(input, sql, params) as ReturnType<PluginSqliteResourceClient['execute']>,
    query: (sql, params) =>
      query.call(input, sql, params) as ReturnType<PluginSqliteResourceClient['query']>,
    transaction: (statements) =>
      transaction.call(input, statements) as ReturnType<PluginSqliteResourceClient['transaction']>,
    close: () => close.call(input) as ReturnType<PluginSqliteResourceClient['close']>
  })
}

function validatePermissionCheck(value: unknown): { readonly permissionId: string } {
  const record = exactRecord(value, ['permissionId'])
  const permissionId = boundedString(requiredField(record, 'permissionId'), 128)
  if (!PERMISSION_ID.test(permissionId)) invalid()
  return Object.freeze({ permissionId })
}

function validateGrantedResult(value: unknown): { readonly granted: boolean } {
  const record = exactRecord(value, ['granted'])
  const granted = requiredField(record, 'granted')
  if (typeof granted !== 'boolean') invalid()
  return Object.freeze({ granted })
}

function validateNull(value: unknown): null {
  if (value !== null) invalid()
  return null
}

function validateOk(value: unknown): { ok: true } {
  const record = exactRecord(value, ['ok'])
  if (requiredField(record, 'ok') !== true) invalid()
  return Object.freeze({ ok: true })
}

function validateBooleanResult(value: unknown, key: 'added' | 'updated' | 'removed') {
  const record = exactRecord(value, [key])
  const result = requiredField(record, key)
  if (typeof result !== 'boolean') invalid()
  return Object.freeze({ [key]: result })
}

function validateCountResult(value: unknown): { removed: number } {
  const record = exactRecord(value, ['removed'])
  const removed = requiredField(record, 'removed')
  if (!Number.isSafeInteger(removed) || Number(removed) < 0) invalid()
  return Object.freeze({ removed: Number(removed) })
}

function validateId(value: unknown, key: 'id' | 'featureId' = 'id'): Record<string, string> {
  const record = exactRecord(value, [key])
  return Object.freeze({
    [key]: boundedString(requiredField(record, key), MAX_IDENTIFIER_BYTES)
  })
}

function validateScope(value: unknown): PluginBusinessItemScope {
  if (value !== 'active-feature' && value !== 'root-results') invalid()
  return value
}

function validatePush(value: unknown): {
  readonly scope: PluginBusinessItemScope
  readonly items: readonly PluginBusinessItemDto[]
} {
  const record = exactRecord(value, ['scope', 'items'])
  const output = Object.freeze({
    scope: validateScope(requiredField(record, 'scope')),
    items: Object.freeze(
      snapshotArray(requiredField(record, 'items'), MAX_ITEMS_PER_PUSH).map((item) =>
        cloneItem(item)
      )
    )
  })
  assertSerializedBytes(output, MAX_ITEM_BATCH_BYTES)
  return output
}

function validateUpdate(value: unknown): {
  readonly scope: PluginBusinessItemScope
  readonly id: string
  readonly patch: PluginBusinessItemDto
} {
  const record = exactRecord(value, ['scope', 'id', 'patch'])
  const patch = cloneItem(requiredField(record, 'patch'), true)
  if (Reflect.ownKeys(patch).length === 0) invalid()
  return Object.freeze({
    scope: validateScope(requiredField(record, 'scope')),
    id: boundedString(requiredField(record, 'id'), MAX_IDENTIFIER_BYTES),
    patch
  })
}

function validateItemList(value: unknown): { readonly items: readonly PluginBusinessItemDto[] } {
  const record = exactRecord(value, ['items'])
  const output = Object.freeze({
    items: Object.freeze(
      snapshotArray(requiredField(record, 'items'), MAX_ITEMS_PER_LIST).map((item) =>
        cloneItem(item)
      )
    )
  })
  assertSerializedBytes(output, MAX_ITEM_BATCH_BYTES)
  return output
}

function validateIcon(value: unknown): IPluginFeature['icon'] {
  const record = exactRecord(value, ['type', 'value', 'color', 'colorful'])
  const type = boundedString(requiredField(record, 'type'), 32)
  if (type !== 'class' && type !== 'emoji') invalid()
  const iconValue = boundedString(requiredField(record, 'value'), 4_096)
  const output: Record<string, unknown> = { type, value: iconValue }
  if (Object.hasOwn(record, 'color')) output.color = boundedString(record.color, 128, true)
  if (Object.hasOwn(record, 'colorful')) {
    if (typeof record.colorful !== 'boolean') invalid()
    output.colorful = record.colorful
  }
  return Object.freeze(output) as unknown as IPluginFeature['icon']
}

function validateStringArray(value: unknown, maximum: number, maximumBytes: number): string[] {
  return snapshotArray(value, maximum).map((entry) => boundedString(entry, maximumBytes))
}

function validateFeature(value: unknown): IPluginFeature {
  const record = exactRecord(value, FEATURE_KEYS)
  const commands = snapshotArray(requiredField(record, 'commands'), MAX_FEATURE_COMMANDS).map(
    (entry) => {
      const command = exactRecord(entry, ['type', 'value'])
      const type = boundedString(requiredField(command, 'type'), 32)
      if (!FEATURE_COMMAND_TYPES.has(type)) invalid()
      const rawValue = requiredField(command, 'value')
      const commandValue = Array.isArray(rawValue)
        ? Object.freeze(validateStringArray(rawValue, 32, 512))
        : boundedString(rawValue, 2_048)
      return Object.freeze({ type, value: commandValue })
    }
  )
  if (commands.length === 0) invalid()
  const platformRecord = exactRecord(requiredField(record, 'platform'), ['win', 'darwin', 'linux'])
  const platform: Record<string, unknown> = Object.create(null)
  for (const key of ['win', 'darwin', 'linux']) {
    if (!Object.hasOwn(platformRecord, key)) continue
    const info = exactRecord(platformRecord[key], ['enable', 'arch', 'os'])
    if (typeof requiredField(info, 'enable') !== 'boolean') invalid()
    platform[key] = Object.freeze({
      enable: info.enable,
      arch: Object.freeze(validateStringArray(requiredField(info, 'arch'), 16, 32)),
      os: Object.freeze(validateStringArray(requiredField(info, 'os'), 16, 32))
    })
  }
  const output: Record<string, unknown> = {
    id: boundedString(requiredField(record, 'id'), MAX_IDENTIFIER_BYTES),
    name: boundedString(requiredField(record, 'name'), 512),
    desc: boundedString(requiredField(record, 'desc'), 4_096, true),
    icon: validateIcon(requiredField(record, 'icon')),
    push: requiredField(record, 'push'),
    platform: Object.freeze(platform),
    commands: Object.freeze(commands)
  }
  if (typeof output.push !== 'boolean') invalid()
  if (Object.hasOwn(record, 'keywords')) {
    output.keywords = Object.freeze(validateStringArray(record.keywords, MAX_FEATURE_KEYWORDS, 256))
  }
  if (Object.hasOwn(record, 'interaction')) {
    const interaction = exactRecord(record.interaction, [
      'type',
      'runtime',
      'path',
      'rendererFeatureId',
      'showInput',
      'allowInput',
      'sendMode',
      'forceMax'
    ])
    const type = requiredField(interaction, 'type')
    if (type !== 'widget') invalid()
    if (Object.hasOwn(interaction, 'runtime') || Object.hasOwn(interaction, 'path')) invalid()
    const rendererFeatureId = boundedString(
      requiredField(interaction, 'rendererFeatureId'),
      MAX_IDENTIFIER_BYTES
    )
    const projected: Record<string, unknown> = { type, rendererFeatureId }
    for (const key of ['showInput', 'allowInput', 'sendMode', 'forceMax']) {
      if (!Object.hasOwn(interaction, key)) continue
      if (typeof interaction[key] !== 'boolean') invalid()
      projected[key] = interaction[key]
    }
    output.interaction = Object.freeze(projected)
  }
  if (Object.hasOwn(record, 'priority')) {
    if (!Number.isSafeInteger(record.priority) || Math.abs(Number(record.priority)) > 1_000_000) {
      invalid()
    }
    output.priority = Number(record.priority)
  }
  if (Object.hasOwn(record, 'experimental')) {
    if (typeof record.experimental !== 'boolean') invalid()
    output.experimental = record.experimental
  }
  if (Object.hasOwn(record, 'acceptedInputTypes')) {
    const accepted = validateStringArray(record.acceptedInputTypes, 4, 16)
    if (accepted.some((entry) => !FEATURE_INPUT_TYPES.has(entry))) invalid()
    output.acceptedInputTypes = Object.freeze(accepted)
  }
  if (Object.hasOwn(record, 'omniTransfer')) {
    output.omniTransfer = cloneDto(record.omniTransfer, {
      maxDepth: 6,
      maxMembers: 64,
      maxStringBytes: 16 * 1024
    })
  }
  if (Object.hasOwn(record, 'footerHints')) {
    output.footerHints = cloneDto(record.footerHints, {
      maxDepth: 6,
      maxMembers: 128,
      maxStringBytes: 16 * 1024
    })
  }
  return Object.freeze(output) as unknown as IPluginFeature
}

function projectFeatureIcon(value: unknown): IPluginFeature['icon'] {
  const record = exactRecord(value, ['type', 'value', 'status', 'color', 'colorful'])
  const type = requiredField(record, 'type')
  if (type === 'file') {
    return Object.freeze({ type: 'class', value: 'i-ri-plug-line' }) as IPluginFeature['icon']
  }
  const projected: Record<string, unknown> = {
    type,
    value: requiredField(record, 'value')
  }
  for (const key of ['color', 'colorful']) {
    if (Object.hasOwn(record, key) && record[key] !== undefined) projected[key] = record[key]
  }
  return validateIcon(projected)
}

function projectFeatureInteraction(
  value: unknown,
  featureId: string
): Readonly<Record<string, unknown>> {
  const interaction = exactRecord(value, [
    'type',
    'runtime',
    'path',
    'rendererFeatureId',
    'showInput',
    'allowInput',
    'sendMode',
    'forceMax'
  ])
  if (requiredField(interaction, 'type') !== 'widget') invalid()
  if (Object.hasOwn(interaction, 'runtime')) boundedString(interaction.runtime, 64)
  if (Object.hasOwn(interaction, 'path')) boundedString(interaction.path, 1_024)
  const rendererFeatureId = Object.hasOwn(interaction, 'rendererFeatureId')
    ? boundedString(interaction.rendererFeatureId, MAX_IDENTIFIER_BYTES)
    : featureId
  const projected: Record<string, unknown> = {
    type: 'widget',
    rendererFeatureId
  }
  for (const key of ['showInput', 'allowInput', 'sendMode', 'forceMax']) {
    if (!Object.hasOwn(interaction, key)) continue
    if (typeof interaction[key] !== 'boolean') invalid()
    projected[key] = interaction[key]
  }
  return Object.freeze(projected)
}

function projectFeaturePlatform(value: unknown): Readonly<Record<string, unknown>> {
  const record = exactRecord(value, ['win', 'win32', 'darwin', 'linux'])
  if (Object.hasOwn(record, 'win') && Object.hasOwn(record, 'win32')) invalid()
  const output: Record<string, unknown> = Object.create(null)
  for (const [sourceKey, projectedKey] of [
    ['win', 'win'],
    ['win32', 'win'],
    ['darwin', 'darwin'],
    ['linux', 'linux']
  ] as const) {
    if (!Object.hasOwn(record, sourceKey)) continue
    const value = record[sourceKey]
    if (typeof value === 'boolean') {
      output[projectedKey] = Object.freeze({ enable: value, arch: [], os: [] })
      continue
    }
    const info = exactRecord(value, ['enable', 'arch', 'os'])
    if (typeof requiredField(info, 'enable') !== 'boolean') invalid()
    output[projectedKey] = Object.freeze({
      enable: info.enable,
      arch: Object.freeze(validateStringArray(requiredField(info, 'arch'), 16, 32)),
      os: Object.freeze(validateStringArray(requiredField(info, 'os'), 16, 32))
    })
  }
  return Object.freeze(output)
}

function projectFeature(feature: IPluginFeature): IPluginFeature {
  const raw = exactRecord(feature, FEATURE_KEYS)
  const featureId = boundedString(requiredField(raw, 'id'), MAX_IDENTIFIER_BYTES)
  const projection: Record<string, unknown> = {
    id: featureId,
    name: requiredField(raw, 'name'),
    desc: requiredField(raw, 'desc'),
    icon: projectFeatureIcon(requiredField(raw, 'icon')),
    push: requiredField(raw, 'push'),
    platform: projectFeaturePlatform(requiredField(raw, 'platform')),
    commands: requiredField(raw, 'commands')
  }
  if (Object.hasOwn(raw, 'interaction')) {
    projection.interaction = projectFeatureInteraction(raw.interaction, featureId)
  }
  for (const key of FEATURE_KEYS) {
    if (!Object.hasOwn(projection, key) && Object.hasOwn(raw, key) && raw[key] !== undefined) {
      projection[key] = raw[key]
    }
  }
  return validateFeature(projection)
}

function validateFeatureAdd(value: unknown): { readonly feature: IPluginFeature } {
  const record = exactRecord(value, ['feature'])
  return Object.freeze({ feature: validateFeature(requiredField(record, 'feature')) })
}

function validateFeatureList(value: unknown): { readonly features: readonly IPluginFeature[] } {
  const record = exactRecord(value, ['features'])
  return Object.freeze({
    features: Object.freeze(
      snapshotArray(requiredField(record, 'features'), MAX_FEATURES).map((entry) =>
        validateFeature(entry)
      )
    )
  })
}

function validateRuntimeInfo(value: unknown): PluginBusinessRuntimeInfoDto {
  const record = exactRecord(value, [
    'name',
    'displayName',
    'version',
    'description',
    'status',
    'sdkapi',
    'category'
  ])
  const sdkapi = requiredField(record, 'sdkapi')
  if (!Number.isSafeInteger(sdkapi) || Number(sdkapi) < 0) invalid()
  return Object.freeze({
    name: boundedString(requiredField(record, 'name'), MAX_IDENTIFIER_BYTES),
    displayName: boundedString(requiredField(record, 'displayName'), 512),
    version: boundedString(requiredField(record, 'version'), 128),
    description: boundedString(requiredField(record, 'description'), 4_096, true),
    status: boundedString(requiredField(record, 'status'), 64),
    sdkapi: Number(sdkapi),
    ...(Object.hasOwn(record, 'category')
      ? { category: boundedString(record.category, 128, true) }
      : {})
  })
}

function validateFileName(value: unknown): string {
  const name = boundedString(value, MAX_FILE_NAME_BYTES)
  if (!FILE_NAME.test(name) || name === '.' || name === '..') invalid()
  return name
}

function validateFileRequest(value: unknown): { readonly name: string } {
  const record = exactRecord(value, ['name'])
  return Object.freeze({ name: validateFileName(requiredField(record, 'name')) })
}

function validateFileWrite(value: unknown): {
  readonly name: string
  readonly value: PluginBusinessDto
} {
  const record = exactRecord(value, ['name', 'value'])
  return Object.freeze({
    name: validateFileName(requiredField(record, 'name')),
    value: cloneFileJson(requiredField(record, 'value'))
  })
}

function validateFileReadResult(
  value: unknown
): { readonly found: false } | { readonly found: true; readonly value: PluginBusinessDto } {
  const record = exactRecord(value, ['found', 'value'])
  const found = requiredField(record, 'found')
  if (found === false) {
    if (Object.hasOwn(record, 'value')) invalid()
    return Object.freeze({ found: false })
  }
  if (found !== true || !Object.hasOwn(record, 'value')) invalid()
  return Object.freeze({ found: true, value: cloneFileJson(record.value) })
}

function validateFileList(value: unknown): { readonly names: readonly string[] } {
  const record = exactRecord(value, ['names'])
  return Object.freeze({
    names: Object.freeze(
      snapshotArray(requiredField(record, 'names'), 1_000).map((entry) => validateFileName(entry))
    )
  })
}

function validateBusinessSqlParams(value: unknown): unknown[] {
  if (value === undefined) return []
  const entries = snapshotArray(value, MAX_SQL_PARAMS)
  let totalBytes = 0
  const output = entries.map((entry) => {
    if (entry === null) return null
    if (typeof entry === 'string') {
      totalBytes += utf8Bytes(entry)
      return entry
    }
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) invalid()
      totalBytes += 8
      return entry
    }
    if (typeof entry === 'boolean') {
      totalBytes += 1
      return entry
    }
    if (!entry || typeof entry !== 'object' || utilTypes.isProxy(entry)) invalid()
    if (entry instanceof ArrayBuffer) {
      totalBytes += entry.byteLength
      if (totalBytes > MAX_SQL_PARAM_BYTES) invalid()
      return entry.slice(0)
    }
    if (utilTypes.isUint8Array(entry)) {
      totalBytes += entry.byteLength
      if (totalBytes > MAX_SQL_PARAM_BYTES) invalid()
      return Uint8Array.from(entry)
    }
    invalid()
  })
  if (totalBytes > MAX_SQL_PARAM_BYTES) invalid()
  return output
}

function validateSqlExecute(value: unknown): {
  readonly op: 'query' | 'execute'
  readonly sql: string
  readonly params: readonly unknown[]
} {
  const record = exactRecord(value, ['op', 'sql', 'params'])
  const op = requiredField(record, 'op')
  if (op !== 'query' && op !== 'execute') invalid()
  const sql = boundedString(requiredField(record, 'sql'), 64 * 1024)
  const params = Object.hasOwn(record, 'params') ? validateBusinessSqlParams(record.params) : []
  return Object.freeze({ op, sql, params: Object.freeze([...params]) })
}

function validateSqlBatch(value: unknown): {
  readonly statements: readonly { readonly sql: string; readonly params: readonly unknown[] }[]
} {
  const record = exactRecord(value, ['statements'])
  const entries = snapshotArray(requiredField(record, 'statements'), 64).map((entry) => {
    const statement = exactRecord(entry, ['sql', 'params'])
    const sql = boundedString(requiredField(statement, 'sql'), 64 * 1024)
    const params = Object.hasOwn(statement, 'params')
      ? validateBusinessSqlParams(statement.params)
      : []
    return { sql, params }
  })
  if (entries.length === 0) invalid()
  const validated = validatePluginTransactionStatements(entries)
  return Object.freeze({
    statements: Object.freeze(
      validated.map((entry) =>
        Object.freeze({ sql: entry.sql, params: Object.freeze([...(entry.params ?? [])]) })
      )
    )
  })
}

function validateSqlExecuteResult(value: unknown):
  | {
      readonly op: 'query'
      readonly rows: readonly Record<string, PluginBusinessDto>[]
      readonly columns: readonly string[]
    }
  | {
      readonly op: 'execute'
      readonly rowsAffected: number
      readonly lastInsertRowId: number | null
    } {
  const candidate = exactRecord(value, ['op', 'rows', 'columns', 'rowsAffected', 'lastInsertRowId'])
  const op = requiredField(candidate, 'op')
  if (op === 'query') {
    const record = exactRecord(candidate, ['op', 'rows', 'columns'])
    const rows = snapshotArray(requiredField(record, 'rows'), 1_000).map((row) =>
      cloneFileJson(row)
    )
    if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) invalid()
    const output = Object.freeze({
      op,
      rows: Object.freeze(rows as Record<string, PluginBusinessDto>[]),
      columns: Object.freeze(validateStringArray(requiredField(record, 'columns'), 1_000, 256))
    })
    assertSerializedBytes(output, MAX_HTTP_RESULT_BYTES)
    return output
  }
  if (op !== 'execute') invalid()
  const record = exactRecord(candidate, ['op', 'rowsAffected', 'lastInsertRowId'])
  const rowsAffected = requiredField(record, 'rowsAffected')
  const lastInsertRowId = requiredField(record, 'lastInsertRowId')
  if (!Number.isSafeInteger(rowsAffected) || Number(rowsAffected) < 0) invalid()
  if (lastInsertRowId !== null && !Number.isSafeInteger(lastInsertRowId)) invalid()
  return Object.freeze({
    op,
    rowsAffected: Number(rowsAffected),
    lastInsertRowId: lastInsertRowId === null ? null : Number(lastInsertRowId)
  })
}

function validateSqlBatchResult(value: unknown): {
  readonly results: readonly {
    readonly rowsAffected: number
    readonly lastInsertRowId: number | null
  }[]
} {
  const record = exactRecord(value, ['results'])
  const results = snapshotArray(requiredField(record, 'results'), 64).map((entry) => {
    const result = exactRecord(entry, ['rowsAffected', 'lastInsertRowId'])
    const rowsAffected = requiredField(result, 'rowsAffected')
    const lastInsertRowId = requiredField(result, 'lastInsertRowId')
    if (!Number.isSafeInteger(rowsAffected) || Number(rowsAffected) < 0) invalid()
    if (lastInsertRowId !== null && !Number.isSafeInteger(lastInsertRowId)) invalid()
    return Object.freeze({
      rowsAffected: Number(rowsAffected),
      lastInsertRowId: lastInsertRowId === null ? null : Number(lastInsertRowId)
    })
  })
  return Object.freeze({ results: Object.freeze(results) })
}

export function pluginBusinessSecretPrefix(pluginName: string): string {
  return `plugin.v2.${Buffer.from(pluginName, 'utf8').toString('base64url')}.`
}

function validateSecretKey(value: unknown): string {
  const key = boundedString(value, 48)
  if (!SECRET_KEY.test(key)) invalid()
  return key
}

function validateSecretRequest(value: unknown): { readonly key: string } {
  const record = exactRecord(value, ['key'])
  return Object.freeze({ key: validateSecretKey(requiredField(record, 'key')) })
}

function validateSecretSet(value: unknown): { readonly key: string; readonly value: string } {
  const record = exactRecord(value, ['key', 'value'])
  return Object.freeze({
    key: validateSecretKey(requiredField(record, 'key')),
    value: boundedString(requiredField(record, 'value'), MAX_SECRET_BYTES)
  })
}

function validateSecretGetResult(
  value: unknown
): { readonly found: false } | { readonly found: true; readonly value: string } {
  const record = exactRecord(value, ['found', 'value'])
  const found = requiredField(record, 'found')
  if (found === false) {
    if (Object.hasOwn(record, 'value')) invalid()
    return Object.freeze({ found: false })
  }
  if (found !== true || !Object.hasOwn(record, 'value')) invalid()
  return Object.freeze({
    found: true,
    value: boundedString(record.value, MAX_SECRET_BYTES, true)
  })
}

function validateClipboardRead(value: unknown): PluginBusinessClipboardReadRequest {
  const record = exactRecord(value, ['op'])
  const op = requiredField(record, 'op')
  if (op !== 'text' && op !== 'snapshot') invalid()
  return Object.freeze({ op })
}

function validateClipboardReadResult(value: unknown): PluginBusinessClipboardReadResult {
  const candidate = exactRecord(value, ['op', 'text', 'html', 'hasImage', 'hasFiles', 'formats'])
  const op = requiredField(candidate, 'op')
  if (op === 'text') {
    const record = exactRecord(candidate, ['op', 'text'])
    return Object.freeze({
      op,
      text: boundedString(requiredField(record, 'text'), MAX_TEXT_BYTES, true)
    })
  }
  if (op !== 'snapshot') invalid()
  const record = exactRecord(candidate, ['op', 'text', 'html', 'hasImage', 'hasFiles', 'formats'])
  const hasImage = requiredField(record, 'hasImage')
  const hasFiles = requiredField(record, 'hasFiles')
  if (typeof hasImage !== 'boolean' || typeof hasFiles !== 'boolean') invalid()
  return Object.freeze({
    op,
    text: boundedString(requiredField(record, 'text'), MAX_TEXT_BYTES, true),
    html: boundedString(requiredField(record, 'html'), MAX_HTML_BYTES, true),
    hasImage,
    hasFiles,
    formats: Object.freeze(validateStringArray(requiredField(record, 'formats'), MAX_FORMATS, 256))
  })
}

function validateClipboardWrite(value: unknown): PluginBusinessClipboardWriteRequest {
  const candidate = exactRecord(value, ['op', 'content'])
  const op = requiredField(candidate, 'op')
  if (op === 'clear') {
    exactRecord(candidate, ['op'])
    return Object.freeze({ op })
  }
  if (op !== 'write') invalid()
  const record = exactRecord(candidate, ['op', 'content'])
  const content = exactRecord(requiredField(record, 'content'), ['text', 'html', 'image', 'files'])
  const output: { text?: string; html?: string; image?: string; files?: readonly string[] } = {}
  if (Object.hasOwn(content, 'text'))
    output.text = boundedString(content.text, MAX_TEXT_BYTES, true)
  if (Object.hasOwn(content, 'html'))
    output.html = boundedString(content.html, MAX_HTML_BYTES, true)
  if (Object.hasOwn(content, 'image')) output.image = boundedString(content.image, MAX_IMAGE_BYTES)
  if (Object.hasOwn(content, 'files')) {
    output.files = Object.freeze(
      snapshotArray(content.files, MAX_FILES).map((entry) => boundedString(entry, MAX_FILE_BYTES))
    )
  }
  if (Reflect.ownKeys(output).length === 0) invalid()
  return Object.freeze({ op, content: Object.freeze(output) })
}

function validateClipboardCopy(value: unknown): PluginBusinessClipboardCopyRequest {
  const record = exactRecord(value, ['text', 'html', 'image', 'files', 'delayMs', 'hideCoreBox'])
  const output: {
    text?: string
    html?: string
    image?: string
    files?: readonly string[]
    delayMs?: number
    hideCoreBox?: boolean
  } = {}
  if (Object.hasOwn(record, 'text')) output.text = boundedString(record.text, MAX_TEXT_BYTES, true)
  if (Object.hasOwn(record, 'html')) output.html = boundedString(record.html, MAX_HTML_BYTES, true)
  if (Object.hasOwn(record, 'image')) output.image = boundedString(record.image, MAX_IMAGE_BYTES)
  if (Object.hasOwn(record, 'files')) {
    output.files = Object.freeze(
      snapshotArray(record.files, MAX_FILES).map((entry) => boundedString(entry, MAX_FILE_BYTES))
    )
  }
  if (Object.hasOwn(record, 'delayMs')) {
    if (
      !Number.isSafeInteger(record.delayMs) ||
      Number(record.delayMs) < 0 ||
      Number(record.delayMs) > 5_000
    ) {
      invalid()
    }
    output.delayMs = Number(record.delayMs)
  }
  if (Object.hasOwn(record, 'hideCoreBox')) {
    if (typeof record.hideCoreBox !== 'boolean') invalid()
    output.hideCoreBox = record.hideCoreBox
  }
  if (!output.text && !output.html && !output.image && !output.files?.length) invalid()
  return Object.freeze(output)
}

function validateClipboardCopyResult(value: unknown): PluginBusinessClipboardCopyResult {
  const record = exactRecord(value, ['success', 'code'])
  const success = requiredField(record, 'success')
  if (typeof success !== 'boolean') invalid()
  if (Object.hasOwn(record, 'code') && !STABLE_CODE.test(boundedString(record.code, 128))) {
    invalid()
  }
  return Object.freeze({
    success,
    ...(Object.hasOwn(record, 'code') ? { code: String(record.code) } : {})
  })
}

function validateOpenUrl(value: unknown): { readonly url: string } {
  const record = exactRecord(value, ['url'])
  return Object.freeze({
    url: boundedString(requiredField(record, 'url'), MAX_HTTP_URL_BYTES)
  })
}

function validateOpenUrlResult(value: unknown): {
  readonly opened: true
  readonly protocol: string
} {
  const record = exactRecord(value, ['opened', 'protocol'])
  if (requiredField(record, 'opened') !== true) invalid()
  return Object.freeze({
    opened: true,
    protocol: boundedString(requiredField(record, 'protocol'), 32)
  })
}

function validateHeaderValue(value: unknown): string {
  const output = boundedString(value, MAX_HTTP_HEADER_BYTES, true)
  for (const character of output) {
    const code = character.charCodeAt(0)
    if ((code <= 31 && code !== 9) || code === 127) invalid()
  }
  return output
}

function validateHeaders(value: unknown): Readonly<Record<string, string>> {
  const record = dynamicRecord(value, MAX_HTTP_HEADERS)
  const keys = Object.keys(record)
  const output: Record<string, string> = Object.create(null)
  for (const key of keys) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(key)) invalid()
    if (HTTP_FORBIDDEN_HEADERS.has(key.toLowerCase())) invalid()
    output[key] = validateHeaderValue(record[key])
  }
  return Object.freeze(output)
}

function validateResponseHeaders(value: unknown): Readonly<Record<string, string>> {
  const record = dynamicRecord(value, MAX_HTTP_HEADERS)
  const output: Record<string, string> = Object.create(null)
  for (const key of Object.keys(record)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(key)) invalid()
    if (HTTP_FORBIDDEN_HEADERS.has(key.toLowerCase())) continue
    output[key] = validateHeaderValue(record[key])
  }
  return Object.freeze(output)
}

function validateQuery(value: unknown): Readonly<Record<string, string | number | boolean | null>> {
  const record = dynamicRecord(value, MAX_HTTP_QUERY)
  const keys = Object.keys(record)
  const output: Record<string, string | number | boolean | null> = Object.create(null)
  for (const key of keys) {
    boundedString(key, 256)
    const entry = record[key]
    if (
      entry !== null &&
      typeof entry !== 'string' &&
      typeof entry !== 'boolean' &&
      !(typeof entry === 'number' && Number.isFinite(entry))
    ) {
      invalid()
    }
    if (typeof entry === 'string') boundedString(entry, 4_096, true)
    output[key] = entry as string | number | boolean | null
  }
  return Object.freeze(output)
}

interface HttpRequestDto {
  readonly method: NetworkRequestOptions['method']
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly query?: Readonly<Record<string, string | number | boolean | null>>
  readonly body?: PluginBusinessDto
  readonly responseType: 'json' | 'text' | 'bytes'
  readonly timeoutMs: number
}

function validateHttpRequest(value: unknown): HttpRequestDto {
  const record = exactRecord(value, [
    'method',
    'url',
    'headers',
    'query',
    'body',
    'responseType',
    'timeoutMs'
  ])
  const method = boundedString(requiredField(record, 'method'), 16).toUpperCase()
  const responseType = requiredField(record, 'responseType')
  if (
    !HTTP_METHODS.has(method) ||
    typeof responseType !== 'string' ||
    !HTTP_RESPONSE_TYPES.has(responseType)
  ) {
    invalid()
  }
  const output: Record<string, unknown> = {
    method,
    url: boundedString(requiredField(record, 'url'), MAX_HTTP_URL_BYTES),
    responseType,
    timeoutMs: 30_000
  }
  if (Object.hasOwn(record, 'headers')) output.headers = validateHeaders(record.headers)
  if (Object.hasOwn(record, 'query')) output.query = validateQuery(record.query)
  if (Object.hasOwn(record, 'body')) {
    const body = cloneDto(record.body, {
      maxDepth: 16,
      maxMembers: 2_048,
      maxStringBytes: MAX_HTTP_BODY_BYTES
    })
    if (utf8Bytes(JSON.stringify(body)) > MAX_HTTP_BODY_BYTES) invalid()
    output.body = body
  }
  if (Object.hasOwn(record, 'timeoutMs')) {
    if (
      !Number.isSafeInteger(record.timeoutMs) ||
      Number(record.timeoutMs) < 100 ||
      Number(record.timeoutMs) > 30_000
    ) {
      invalid()
    }
    output.timeoutMs = Number(record.timeoutMs)
  }
  return Object.freeze(output) as unknown as HttpRequestDto
}

function validateHttpResult(value: unknown): Readonly<Record<string, unknown>> {
  const record = exactRecord(value, ['status', 'statusText', 'headers', 'data', 'url', 'ok'])
  const status = requiredField(record, 'status')
  const ok = requiredField(record, 'ok')
  if (
    !Number.isSafeInteger(status) ||
    Number(status) < 100 ||
    Number(status) > 599 ||
    typeof ok !== 'boolean'
  ) {
    invalid()
  }
  const data = cloneDto(requiredField(record, 'data'), {
    maxDepth: 24,
    maxMembers: 10_000,
    maxStringBytes: MAX_HTTP_RESULT_BYTES
  })
  const output = Object.freeze({
    status: Number(status),
    statusText: boundedString(requiredField(record, 'statusText'), 512, true),
    headers: validateResponseHeaders(requiredField(record, 'headers')),
    data,
    url: boundedString(requiredField(record, 'url'), MAX_HTTP_URL_BYTES),
    ok
  })
  if (utf8Bytes(JSON.stringify(output)) > MAX_HTTP_RESULT_BYTES) invalid()
  return output
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]
  const version = isIP(normalized)
  if (version === 4) return PRIVATE_NETWORKS.check(normalized, 'ipv4')
  if (version === 6) return PRIVATE_NETWORKS.check(normalized, 'ipv6')
  return true
}

async function assertPublicHttpUrl(
  rawUrl: string,
  resolveAddresses: (hostname: string) => Promise<readonly string[]>
): Promise<{ readonly url: URL; readonly addresses: readonly string[] }> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('PLUGIN_BUSINESS_HTTP_URL_INVALID')
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new Error('PLUGIN_BUSINESS_HTTP_URL_INVALID')
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('PLUGIN_BUSINESS_HTTP_PRIVATE_ADDRESS')
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error('PLUGIN_BUSINESS_HTTP_PRIVATE_ADDRESS')
  }
  let resolved: readonly string[]
  try {
    resolved = await resolveAddresses(hostname)
  } catch {
    throw new Error('PLUGIN_BUSINESS_HTTP_DNS_FAILED')
  }
  let addresses: string[]
  try {
    addresses = snapshotArray(resolved, 16).map((address) =>
      boundedString(address, MAX_IDENTIFIER_BYTES)
    )
  } catch {
    throw new Error('PLUGIN_BUSINESS_HTTP_PRIVATE_ADDRESS')
  }
  if (addresses.length < 1 || addresses.some((address) => isPrivateAddress(address))) {
    throw new Error('PLUGIN_BUSINESS_HTTP_PRIVATE_ADDRESS')
  }
  return Object.freeze({ url: parsed, addresses: Object.freeze([...addresses]) })
}

function buildHttpRequestUrl(
  target: URL,
  query?: Readonly<Record<string, string | number | boolean | null>>
): string {
  const output = new URL(target.toString())
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null) output.searchParams.set(key, String(value))
  }
  return output.toString()
}

function freezeDefinition(
  definition: PluginHostCapabilityDefinition
): PluginHostCapabilityDefinition {
  return Object.freeze(definition)
}

export function createPluginBusinessCapabilities(
  rawOptions: PluginBusinessCapabilityOptions
): PluginBusinessCapabilities {
  const optionRecord = exactRecord(rawOptions, [
    'resolvePlugin',
    'resolveHostGeneration',
    'hasPermission',
    'sqliteOwners',
    'secureStoreRootPath',
    'secureStore',
    'clipboard',
    'openUrl',
    'network'
  ])
  const options = optionRecord as unknown as PluginBusinessCapabilityOptions
  const resolvePlugin = readMethod(optionRecord, 'resolvePlugin')
  const resolveHostGeneration = readMethod(optionRecord, 'resolveHostGeneration')
  const hasPermission = readMethod(optionRecord, 'hasPermission')
  const sqliteOwnersInput = requiredField(optionRecord, 'sqliteOwners')
  const sqliteAcquire = readMethod(sqliteOwnersInput, 'acquire')
  const sqliteCloseActivation = readMethod(sqliteOwnersInput, 'closeActivation')
  const secureStoreInput = exactRecord(requiredField(optionRecord, 'secureStore'), ['get', 'set'])
  const secureGet = readMethod(secureStoreInput, 'get')
  const secureSet = readMethod(secureStoreInput, 'set')
  const clipboardInput = exactRecord(requiredField(optionRecord, 'clipboard'), [
    'read',
    'write',
    'copyAndPaste'
  ])
  const clipboardRead = readMethod(clipboardInput, 'read')
  const clipboardWrite = readMethod(clipboardInput, 'write')
  const clipboardCopyAndPaste = readMethod(clipboardInput, 'copyAndPaste')
  const networkInput = exactRecord(requiredField(optionRecord, 'network'), [
    'requestPinned',
    'resolveAddresses'
  ])
  const networkRequestPinned = Object.hasOwn(networkInput, 'requestPinned')
    ? readMethod(networkInput, 'requestPinned')
    : undefined
  const resolveAddressesMethod = readMethod(networkInput, 'resolveAddresses')
  const openUrlMethod = readMethod(optionRecord, 'openUrl')
  const secureStoreRootPath = boundedString(
    requiredField(optionRecord, 'secureStoreRootPath'),
    4_096
  )
  const resolveAddresses = (hostname: string): Promise<readonly string[]> =>
    Promise.resolve(resolveAddressesMethod.call(networkInput, hostname) as readonly string[])
  const records = new Map<string, ActivationRecord>()
  const itemOwners = new Map<string, ActivationRecord>()
  const featureOwners = new Map<string, ActivationRecord>()

  const resolveActor = (context: PluginSecurityContext): BusinessActor => {
    if (!isAuthoritativePluginContext(context)) authorityInvalid()
    const identity = context.identity
    const hostGeneration = identity.hostGeneration
    if (
      identity.authority !== 'plugin-host' ||
      !Number.isSafeInteger(hostGeneration) ||
      Number(hostGeneration) < 1 ||
      context.name !== identity.pluginName
    ) {
      authorityInvalid()
    }
    let plugin: PluginBusinessPlugin | undefined
    try {
      plugin = resolvePlugin.call(options, identity.pluginName) as PluginBusinessPlugin | undefined
    } catch {
      authorityInvalid()
    }
    if (!plugin || typeof plugin !== 'object') authorityInvalid()
    const getActivationIdentity = readMethod(plugin, 'getActivationIdentity')
    let current: PluginActivationIdentity
    let currentHostGeneration: unknown
    try {
      current = snapshotActivation(getActivationIdentity.call(plugin))
      currentHostGeneration = resolveHostGeneration.call(options, current)
    } catch {
      authorityInvalid()
    }
    if (
      current.name !== identity.pluginName ||
      current.pluginInstanceId !== identity.pluginInstanceId ||
      current.activationGeneration !== identity.activationGeneration ||
      current.key !== context.uniqueKey ||
      currentHostGeneration !== identity.hostGeneration
    ) {
      authorityInvalid()
    }
    const key = activationRecordKey(current)
    let record = records.get(key)
    if (record) {
      if (
        record.closed ||
        !sameActivation(record.activation, current) ||
        record.hostGeneration !== hostGeneration ||
        record.plugin !== plugin
      ) {
        authorityInvalid()
      }
    } else {
      const createFeatureHost = readMethod(plugin, 'createBusinessFeatureHost')
      const featureHost = snapshotFeatureHost(createFeatureHost.call(plugin, current))
      record = {
        activation: current,
        hostGeneration: Number(hostGeneration),
        plugin,
        featureHost,
        featureIds: new Set(),
        itemIds: new Set(),
        closed: false
      }
      records.set(key, record)
    }
    if (!record) authorityInvalid()
    return Object.freeze({
      activation: current,
      hostGeneration: Number(hostGeneration),
      plugin,
      context,
      record
    })
  }

  const sqliteClientFor = async (actor: BusinessActor): Promise<PluginSqliteResourceClient> => {
    const getDataPath = readMethod(actor.plugin, 'getDataPath')
    const dataPath = getDataPath.call(actor.plugin)
    if (typeof dataPath !== 'string' || dataPath.length === 0) unavailable()
    return snapshotSqliteClient(
      await sqliteAcquire.call(
        sqliteOwnersInput,
        {
          pluginName: actor.activation.name,
          pluginInstanceId: actor.activation.pluginInstanceId,
          activationGeneration: actor.activation.activationGeneration
        },
        dataPath
      )
    )
  }

  const releaseOwnedItems = async (record: ActivationRecord): Promise<void> => {
    const ids = [...record.itemIds].filter(
      (id) => itemOwners.get(ownerItemKey(record.activation.name, id)) === record
    )
    for (const id of [...record.itemIds]) {
      if (!ids.includes(id)) record.itemIds.delete(id)
    }
    if (ids.length === 0) return
    const cleanup = readMethod(record.plugin, 'cleanupBusinessItems')
    await cleanup.call(record.plugin, record.activation, Object.freeze(ids))
    for (const id of ids) {
      const ownerKey = ownerItemKey(record.activation.name, id)
      if (itemOwners.get(ownerKey) === record) itemOwners.delete(ownerKey)
      record.itemIds.delete(id)
    }
  }

  const projectOwnedWidgetItem = (
    actor: BusinessActor,
    item: PluginBusinessItemDto
  ): PluginBusinessItemDto => {
    const itemRecord = item as Readonly<Record<string, PluginBusinessDto>>
    const meta = itemRecord.meta as Readonly<Record<string, PluginBusinessDto>>
    const featureId = boundedString(meta.featureId, MAX_IDENTIFIER_BYTES)
    if (meta.pluginName !== actor.activation.name) authorityInvalid()

    const actions = itemRecord.actions as readonly PluginBusinessDto[] | undefined
    for (const value of actions ?? []) {
      const action = value as Readonly<Record<string, PluginBusinessDto>>
      if (action.type !== 'navigate') continue
      const fixed = FIXED_WIDGET_NAVIGATION[action.id as keyof typeof FIXED_WIDGET_NAVIGATION]
      const payload = action.payload as Readonly<Record<string, PluginBusinessDto>>
      if (!fixed || fixed.pluginName !== actor.activation.name || payload.path !== fixed.path) {
        authorityInvalid()
      }
    }

    const list = readMethod(actor.plugin, 'listBusinessFeatures')
    const rawFeatures = snapshotArray(list.call(actor.plugin), MAX_FEATURES)
    const features = new Map<string, Record<string, unknown>>()
    for (const value of rawFeatures) {
      const featureRecord = exactRecord(value, FEATURE_KEYS)
      const id = boundedString(requiredField(featureRecord, 'id'), MAX_IDENTIFIER_BYTES)
      if (features.has(id)) invalid()
      features.set(id, featureRecord)
    }
    const feature = features.get(featureId)
    if (!feature || !Object.hasOwn(feature, 'interaction')) invalid()
    const interaction = exactRecord(feature.interaction, [
      'type',
      'runtime',
      'path',
      'rendererFeatureId',
      'showInput',
      'allowInput',
      'sendMode',
      'forceMax'
    ])
    if (requiredField(interaction, 'type') !== 'widget') invalid()
    const ownsPath = Object.hasOwn(interaction, 'path')
    const hasRendererFeatureId = Object.hasOwn(interaction, 'rendererFeatureId')
    if (ownsPath === hasRendererFeatureId) invalid()
    const rendererFeatureId = hasRendererFeatureId
      ? boundedString(interaction.rendererFeatureId, MAX_IDENTIFIER_BYTES)
      : featureId
    const rendererFeature = features.get(rendererFeatureId)
    if (!rendererFeature || !Object.hasOwn(rendererFeature, 'interaction')) invalid()
    const rendererInteraction = exactRecord(rendererFeature.interaction, [
      'type',
      'runtime',
      'path',
      'rendererFeatureId',
      'showInput',
      'allowInput',
      'sendMode',
      'forceMax'
    ])
    if (
      requiredField(rendererInteraction, 'type') !== 'widget' ||
      !Object.hasOwn(rendererInteraction, 'path') ||
      Object.hasOwn(rendererInteraction, 'rendererFeatureId')
    ) {
      invalid()
    }

    const render = itemRecord.render as Readonly<Record<string, PluginBusinessDto>>
    const custom = render.custom as Readonly<Record<string, PluginBusinessDto>>
    const expectedContent = `${actor.activation.name}::${rendererFeatureId}`
    if (custom.content !== expectedContent) authorityInvalid()

    return cloneWidgetItem({
      ...itemRecord,
      source: {
        type: 'plugin',
        id: 'plugin-features',
        name: actor.activation.name
      },
      meta: {
        ...meta,
        pluginName: actor.activation.name,
        featureId
      },
      render: {
        ...render,
        custom: {
          ...custom,
          content: expectedContent
        }
      }
    })
  }

  const pushOwnedItems = async (
    actor: BusinessActor,
    scope: PluginBusinessItemScope,
    items: readonly PluginBusinessItemDto[],
    signal: AbortSignal
  ): Promise<void> => {
    const priorOwners = new Set<ActivationRecord>()
    const replacements: PluginBusinessItemReplacement[] = []
    for (const item of items) {
      const id = String(item.id)
      const prior = itemOwners.get(ownerItemKey(actor.activation.name, id))
      if (prior && prior !== actor.record) {
        priorOwners.add(prior)
        replacements.push({ id, activation: prior.activation })
      }
    }
    await actor.record.featureHost.pushItems(scope, items, signal, replacements)
    for (const item of items) {
      const id = String(item.id)
      actor.record.itemIds.add(id)
      itemOwners.set(ownerItemKey(actor.activation.name, id), actor.record)
      for (const replacement of replacements) {
        if (replacement.id === id) {
          const prior = records.get(activationRecordKey(replacement.activation))
          if (prior && prior !== actor.record) prior.itemIds.delete(id)
        }
      }
    }
    for (const prior of priorOwners) await releaseOwnedItems(prior)
  }

  const definitions: PluginHostCapabilityDefinition[] = [
    freezeDefinition({
      id: 'plugin.info.get',
      timeoutMs: 5_000,
      maxConcurrency: 8,
      validateRequest: validateNull,
      validateResult: validateRuntimeInfo,
      async invoke(context) {
        const actor = resolveActor(context)
        const method = readMethod(actor.plugin, 'getBusinessRuntimeInfo')
        return validateRuntimeInfo(method.call(actor.plugin))
      }
    }),
    freezeDefinition({
      id: 'permission.check',
      timeoutMs: 5_000,
      maxConcurrency: 8,
      validateRequest: validatePermissionCheck,
      validateResult: validateGrantedResult,
      invoke(context, request) {
        const actor = resolveActor(context)
        const permissionId = (request as { permissionId: string }).permissionId
        const sdkapi = actor.plugin.sdkapi
        if (typeof sdkapi !== 'number') return { granted: false }
        let granted = false
        try {
          granted =
            hasPermission.call(options, actor.activation.name, permissionId, sdkapi) === true
        } catch {
          granted = false
        }
        return { granted }
      }
    }),
    freezeDefinition({
      id: 'feature.registry.add',
      timeoutMs: 10_000,
      maxConcurrency: 1,
      validateRequest: validateFeatureAdd,
      validateResult: (value) => validateBooleanResult(value, 'added'),
      async invoke(context, request) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validateFeatureAdd>
        const ownerKey = ownerItemKey(actor.activation.name, normalized.feature.id)
        if (featureOwners.has(ownerKey)) return { added: false }
        const add = readMethod(actor.plugin, 'addBusinessFeature')
        const added = (await add.call(actor.plugin, normalized.feature)) === true
        if (added) {
          actor.record.featureIds.add(normalized.feature.id)
          featureOwners.set(ownerKey, actor.record)
        }
        return { added }
      }
    }),
    freezeDefinition({
      id: 'feature.registry.remove',
      timeoutMs: 5_000,
      maxConcurrency: 1,
      validateRequest: (value) => validateId(value, 'featureId'),
      validateResult: (value) => validateBooleanResult(value, 'removed'),
      async invoke(context, request) {
        const actor = resolveActor(context)
        const featureId = (request as { featureId: string }).featureId
        const ownerKey = ownerItemKey(actor.activation.name, featureId)
        if (featureOwners.get(ownerKey) !== actor.record) return { removed: false }
        const remove = readMethod(actor.plugin, 'removeBusinessFeature')
        const removed = (await remove.call(actor.plugin, featureId)) === true
        if (removed) {
          actor.record.featureIds.delete(featureId)
          featureOwners.delete(ownerKey)
        }
        return { removed }
      }
    }),
    freezeDefinition({
      id: 'feature.registry.list',
      timeoutMs: 5_000,
      maxConcurrency: 8,
      validateRequest: validateNull,
      validateResult: validateFeatureList,
      invoke(context) {
        const actor = resolveActor(context)
        const list = readMethod(actor.plugin, 'listBusinessFeatures')
        const features = snapshotArray(list.call(actor.plugin), MAX_FEATURES).map((entry) =>
          projectFeature(entry as IPluginFeature)
        )
        return { features }
      }
    }),
    freezeDefinition({
      id: 'feature.items.push',
      permission: 'search.root-results',
      timeoutMs: 30_000,
      maxConcurrency: 1,
      validateRequest: validatePush,
      validateResult: validateOk,
      async invoke(context, request, signal) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validatePush>
        await pushOwnedItems(actor, normalized.scope, normalized.items, signal)
        return { ok: true }
      }
    }),
    freezeDefinition({
      id: 'feature.items.widget.push',
      permission: 'search.root-results',
      timeoutMs: 30_000,
      maxConcurrency: 1,
      validateRequest: validateWidgetPush,
      validateResult: validateOk,
      async invoke(context, request, signal) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validateWidgetPush>
        const items = Object.freeze(
          normalized.items.map((item) => projectOwnedWidgetItem(actor, item))
        )
        await pushOwnedItems(actor, normalized.scope, items, signal)
        return { ok: true }
      }
    }),
    freezeDefinition({
      id: 'feature.items.update',
      permission: 'search.root-results',
      timeoutMs: 30_000,
      maxConcurrency: 1,
      validateRequest: validateUpdate,
      validateResult: (value) => validateBooleanResult(value, 'updated'),
      async invoke(context, request, signal) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validateUpdate>
        if (itemOwners.get(ownerItemKey(actor.activation.name, normalized.id)) !== actor.record) {
          return { updated: false }
        }
        return {
          updated:
            (await actor.record.featureHost.updateItem(
              normalized.scope,
              normalized.id,
              normalized.patch,
              signal
            )) === true
        }
      }
    }),
    freezeDefinition({
      id: 'feature.items.remove',
      timeoutMs: 5_000,
      maxConcurrency: 1,
      validateRequest: validateId,
      validateResult: (value) => validateBooleanResult(value, 'removed'),
      async invoke(context, request, signal) {
        const actor = resolveActor(context)
        const id = (request as { id: string }).id
        const ownerKey = ownerItemKey(actor.activation.name, id)
        if (itemOwners.get(ownerKey) !== actor.record) return { removed: false }
        const removed = (await actor.record.featureHost.removeItem(id, signal)) === true
        if (removed) {
          actor.record.itemIds.delete(id)
          itemOwners.delete(ownerKey)
        }
        return { removed }
      }
    }),
    freezeDefinition({
      id: 'feature.items.clear',
      timeoutMs: 5_000,
      maxConcurrency: 1,
      validateRequest: validateNull,
      validateResult: validateCountResult,
      async invoke(context, _request, signal) {
        const actor = resolveActor(context)
        let removed = 0
        for (const id of [...actor.record.itemIds]) {
          const ownerKey = ownerItemKey(actor.activation.name, id)
          if (itemOwners.get(ownerKey) !== actor.record) continue
          if ((await actor.record.featureHost.removeItem(id, signal)) === true) removed += 1
          actor.record.itemIds.delete(id)
          itemOwners.delete(ownerKey)
        }
        return { removed }
      }
    }),
    freezeDefinition({
      id: 'feature.items.list',
      timeoutMs: 5_000,
      maxConcurrency: 8,
      validateRequest: validateNull,
      validateResult: validateItemList,
      async invoke(context, _request, signal) {
        const actor = resolveActor(context)
        const owned = new Set(
          [...actor.record.itemIds].filter(
            (id) => itemOwners.get(ownerItemKey(actor.activation.name, id)) === actor.record
          )
        )
        const listed = await actor.record.featureHost.listItems(signal)
        let projected: PluginBusinessItemDto[]
        try {
          projected = snapshotArray(listed, MAX_ITEMS_PER_LIST).map((item) => cloneItem(item))
        } catch {
          return { items: listed as never }
        }
        const items = projected.filter((item) => owned.has(String(item.id)))
        return { items }
      }
    }),
    freezeDefinition({
      id: 'storage.file.read',
      permission: 'storage.plugin',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateFileRequest,
      validateResult: validateFileReadResult,
      async invoke(context, request) {
        const actor = resolveActor(context)
        const method = readMethod(actor.plugin, 'readBusinessFile')
        return await method.call(actor.plugin, (request as { name: string }).name)
      }
    }),
    freezeDefinition({
      id: 'storage.file.write',
      permission: 'storage.plugin',
      timeoutMs: 30_000,
      maxConcurrency: 1,
      validateRequest: validateFileWrite,
      validateResult: validateOk,
      async invoke(context, request) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validateFileWrite>
        const method = readMethod(actor.plugin, 'writeBusinessFile')
        await method.call(actor.plugin, normalized.name, normalized.value)
        return { ok: true }
      }
    }),
    freezeDefinition({
      id: 'storage.file.remove',
      permission: 'storage.plugin',
      timeoutMs: 30_000,
      maxConcurrency: 1,
      validateRequest: validateFileRequest,
      validateResult: (value) => validateBooleanResult(value, 'removed'),
      async invoke(context, request) {
        const actor = resolveActor(context)
        const method = readMethod(actor.plugin, 'removeBusinessFile')
        return {
          removed: (await method.call(actor.plugin, (request as { name: string }).name)) === true
        }
      }
    }),
    freezeDefinition({
      id: 'storage.file.list',
      permission: 'storage.plugin',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateNull,
      validateResult: validateFileList,
      async invoke(context) {
        const actor = resolveActor(context)
        const method = readMethod(actor.plugin, 'listBusinessFiles')
        const names = snapshotArray(await method.call(actor.plugin), 1_000).map((entry) =>
          validateFileName(entry)
        )
        return { names: names.sort() }
      }
    }),
    freezeDefinition({
      id: 'storage.sqlite.execute',
      permission: 'storage.sqlite',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateSqlExecute,
      validateResult: validateSqlExecuteResult,
      async invoke(context, request) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validateSqlExecute>
        const client = await sqliteClientFor(actor)
        if (normalized.op === 'query') {
          validatePluginSql(normalized.sql, 'query')
          const rawResult = await client.query(normalizePluginSqlForExecution(normalized.sql), [
            ...normalized.params
          ])
          let result: Record<string, unknown>
          try {
            result = exactRecord(rawResult, ['rows', 'columns'])
          } catch {
            return rawResult as never
          }
          return { op: 'query', rows: result.rows, columns: result.columns }
        }
        validatePluginSql(normalized.sql, 'execute')
        const rawResult = await client.execute(normalizePluginSqlForExecution(normalized.sql), [
          ...normalized.params
        ])
        let result: Record<string, unknown>
        try {
          result = exactRecord(rawResult, ['rowsAffected', 'lastInsertRowId'])
        } catch {
          return rawResult as never
        }
        return {
          op: 'execute',
          rowsAffected: result.rowsAffected,
          lastInsertRowId: result.lastInsertRowId
        }
      }
    }),
    freezeDefinition({
      id: 'storage.sqlite.batch',
      permission: 'storage.sqlite',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateSqlBatch,
      validateResult: validateSqlBatchResult,
      async invoke(context, request) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validateSqlBatch>
        const client = await sqliteClientFor(actor)
        const rawResult = await client.transaction(
          normalized.statements.map((statement) => ({
            sql: normalizePluginSqlForExecution(statement.sql),
            params: [...statement.params]
          }))
        )
        let result: Record<string, unknown>
        try {
          result = exactRecord(rawResult, ['results'])
        } catch {
          return rawResult as never
        }
        return { results: result.results }
      }
    }),
    freezeDefinition({
      id: 'secret.get',
      permission: 'storage.plugin',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateSecretRequest,
      validateResult: validateSecretGetResult,
      async invoke(context, request) {
        const actor = resolveActor(context)
        const key = (request as { key: string }).key
        const value = (await secureGet.call(
          secureStoreInput,
          secureStoreRootPath,
          `${pluginBusinessSecretPrefix(actor.activation.name)}${key}`
        )) as string | null
        return value === null ? { found: false } : { found: true, value }
      }
    }),
    freezeDefinition({
      id: 'secret.set',
      permission: 'storage.plugin',
      timeoutMs: 30_000,
      maxConcurrency: 4,
      validateRequest: validateSecretSet,
      validateResult: validateOk,
      async invoke(context, request) {
        const actor = resolveActor(context)
        const normalized = request as ReturnType<typeof validateSecretSet>
        const persisted = await secureSet.call(
          secureStoreInput,
          secureStoreRootPath,
          `${pluginBusinessSecretPrefix(actor.activation.name)}${normalized.key}`,
          normalized.value
        )
        if (persisted !== true) unavailable()
        return { ok: true }
      }
    }),
    freezeDefinition({
      id: 'secret.delete',
      permission: 'storage.plugin',
      timeoutMs: 30_000,
      maxConcurrency: 4,
      validateRequest: validateSecretRequest,
      validateResult: validateOk,
      async invoke(context, request) {
        const actor = resolveActor(context)
        const key = (request as { key: string }).key
        const persisted = await secureSet.call(
          secureStoreInput,
          secureStoreRootPath,
          `${pluginBusinessSecretPrefix(actor.activation.name)}${key}`,
          null
        )
        if (persisted !== true) unavailable()
        return { ok: true }
      }
    }),
    freezeDefinition({
      id: 'clipboard.read',
      permission: 'clipboard.read',
      timeoutMs: 5_000,
      maxConcurrency: 4,
      validateRequest: validateClipboardRead,
      validateResult: validateClipboardReadResult,
      async invoke(context, request, signal) {
        resolveActor(context)
        return await clipboardRead.call(clipboardInput, request, context, signal)
      }
    }),
    freezeDefinition({
      id: 'clipboard.write',
      permission: 'clipboard.write',
      timeoutMs: 5_000,
      maxConcurrency: 2,
      validateRequest: validateClipboardWrite,
      validateResult: validateOk,
      async invoke(context, request, signal) {
        resolveActor(context)
        await clipboardWrite.call(clipboardInput, request, context, signal)
        return { ok: true }
      }
    }),
    freezeDefinition({
      id: 'clipboard.copy-and-paste',
      permission: 'clipboard.write',
      timeoutMs: 30_000,
      maxConcurrency: 1,
      validateRequest: validateClipboardCopy,
      validateResult: validateClipboardCopyResult,
      async invoke(context, request, signal) {
        resolveActor(context)
        return await clipboardCopyAndPaste.call(clipboardInput, request, context, signal)
      }
    }),
    freezeDefinition({
      id: 'open-url',
      permission: 'network.internet',
      timeoutMs: 5_000,
      maxConcurrency: 4,
      validateRequest: validateOpenUrl,
      validateResult: validateOpenUrlResult,
      async invoke(context, request) {
        resolveActor(context)
        const rawUrl = (request as { url: string }).url
        let parsed: URL
        try {
          parsed = new URL(rawUrl)
        } catch {
          unavailable()
        }
        if (parsed.username || parsed.password) unavailable()
        const rawDecision = await openUrlMethod.call(options, parsed.toString())
        let decision: Record<string, unknown>
        try {
          decision = exactRecord(rawDecision, ['allowed', 'url', 'protocol'])
        } catch {
          return rawDecision as never
        }
        if (
          requiredField(decision, 'allowed') !== true ||
          typeof requiredField(decision, 'protocol') !== 'string' ||
          decision.protocol !== parsed.protocol ||
          (Object.hasOwn(decision, 'url') && decision.url !== parsed.toString())
        ) {
          unavailable()
        }
        return { opened: true, protocol: decision.protocol as string }
      }
    }),
    freezeDefinition({
      id: 'http.request',
      permission: 'network.internet',
      timeoutMs: 30_000,
      maxConcurrency: 8,
      validateRequest: validateHttpRequest,
      validateResult: validateHttpResult,
      async invoke(context, request, signal) {
        resolveActor(context)
        if (!networkRequestPinned) unavailable()
        const normalized = request as HttpRequestDto
        const target = await assertPublicHttpUrl(normalized.url, resolveAddresses)
        const expectedUrl = buildHttpRequestUrl(target.url, normalized.query)
        const rawResponse = await networkRequestPinned.call(
          networkInput,
          {
            method: normalized.method,
            url: target.url.toString(),
            ...(normalized.headers ? { headers: { ...normalized.headers } } : {}),
            ...(normalized.query ? { query: { ...normalized.query } } : {}),
            ...(Object.hasOwn(normalized, 'body') ? { body: normalized.body } : {}),
            timeoutMs: normalized.timeoutMs,
            signal,
            retryPolicy: { maxRetries: 0 },
            responseType:
              normalized.responseType === 'bytes' ? 'arrayBuffer' : normalized.responseType,
            validateStatus: HTTP_STATUSES
          },
          {
            resolvedAddresses: target.addresses,
            maxResponseBytes: MAX_HTTP_RESPONSE_BYTES
          }
        )
        let response: Record<string, unknown>
        try {
          response = exactRecord(rawResponse, [
            'status',
            'statusText',
            'headers',
            'data',
            'url',
            'ok'
          ])
        } catch {
          return rawResponse as never
        }
        if (response.url !== expectedUrl) unavailable()
        if (normalized.responseType === 'bytes') {
          if (
            !response.data ||
            typeof response.data !== 'object' ||
            utilTypes.isProxy(response.data) ||
            !utilTypes.isArrayBuffer(response.data) ||
            response.data.byteLength > MAX_HTTP_RESPONSE_BYTES
          ) {
            return rawResponse as never
          }
        }
        const data =
          normalized.responseType === 'bytes'
            ? Buffer.from(response.data as ArrayBuffer).toString('base64')
            : response.data
        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data,
          url: response.url,
          ok: response.ok
        }
      }
    })
  ]

  const closeActivation = async (activationInput: PluginActivationIdentity): Promise<void> => {
    const activation = snapshotActivation(activationInput)
    const cleanupErrors: unknown[] = []
    const key = activationRecordKey(activation)
    const record = records.get(key)
    if (!record || !sameActivation(record.activation, activation) || record.closed) return
    record.closed = true
    try {
      await releaseOwnedItems(record)
    } catch (error) {
      cleanupErrors.push(error)
    }
    let removeFeature: ((...args: unknown[]) => unknown) | undefined
    try {
      removeFeature = readMethod(record.plugin, 'removeBusinessFeature')
    } catch (error) {
      cleanupErrors.push(error)
    }
    for (const featureId of [...record.featureIds]) {
      const ownerKey = ownerItemKey(activation.name, featureId)
      if (featureOwners.get(ownerKey) !== record) {
        record.featureIds.delete(featureId)
        continue
      }
      if (!removeFeature) continue
      try {
        await removeFeature.call(record.plugin, featureId)
        if (featureOwners.get(ownerKey) === record) featureOwners.delete(ownerKey)
        record.featureIds.delete(featureId)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await sqliteCloseActivation.call(sqliteOwnersInput, {
        pluginName: activation.name,
        pluginInstanceId: activation.pluginInstanceId,
        activationGeneration: activation.activationGeneration
      })
    } catch (error) {
      cleanupErrors.push(error)
    }
    if (cleanupErrors.length > 0) {
      record.closed = false
      throw new AggregateError(cleanupErrors, 'PLUGIN_BUSINESS_CLEANUP_FAILED')
    }
    records.delete(key)
  }

  const closeAll = async (): Promise<void> => {
    const cleanupErrors: unknown[] = []
    for (const record of [...records.values()]) {
      try {
        await closeActivation(record.activation)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (cleanupErrors.length > 0)
      throw new AggregateError(cleanupErrors, 'PLUGIN_BUSINESS_CLEANUP_FAILED')
  }

  return Object.freeze({
    definitions: Object.freeze(definitions),
    closeActivation,
    closeAll
  })
}
