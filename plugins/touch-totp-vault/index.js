const { plugin, secret, clipboard, permission, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-totp-vault'
const SOURCE_ID = 'plugin-features'
const STORE_FILE = 'totp-accounts.json'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const SECRET_KEY_RE = /^[\w.-]{1,48}$/
const MAX_ACCOUNTS = 128
const MAX_PENDING_DRAFTS = 8

let activeGeneration = 0
let destroyed = false
let idSequence = 0
const pendingDrafts = new Map()

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function normalizeAlgorithm(raw) {
  const token = normalizeText(raw || 'SHA-1').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (token === 'SHA1')
    return 'SHA-1'
  if (token === 'SHA256')
    return 'SHA-256'
  if (token === 'SHA512')
    return 'SHA-512'
  return null
}

function normalizeDigits(raw) {
  const n = Number.parseInt(String(raw ?? 6), 10)
  return n === 8 ? 8 : n === 6 ? 6 : null
}

function normalizePeriod(raw) {
  const n = Number.parseInt(String(raw ?? 30), 10)
  if (!Number.isSafeInteger(n) || n < 15 || n > 300)
    return null
  return n
}

function generateAccountId() {
  idSequence += 1
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    const compact = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    return `acct_${compact}`
  }
  return `acct_${Date.now().toString(36)}_${idSequence}`
}

function buildSecretKey(accountId) {
  const key = `totp.${accountId}`
  if (!SECRET_KEY_RE.test(key))
    throw new Error('Invalid secret storage key')
  return key
}

// =============================================================================
// 1. Pure-JS RFC 4648 Base32 Decoder (Pure Uint8Array / Zero External Deps)
// =============================================================================

function decodeBase32(input) {
  const compact = normalizeText(input).replace(/[\s-]+/g, '').toUpperCase()
  if (!compact)
    throw new Error('Empty Base32 seed')

  const stripped = compact.replace(/=+$/, '')
  if (!stripped || stripped.includes('='))
    throw new Error('Malformed Base32 padding')

  const rem = stripped.length % 8
  if (rem === 1 || rem === 3 || rem === 6)
    throw new Error('Invalid Base32 length')

  let bits = 0
  let bitCount = 0
  const bytes = []

  for (let i = 0; i < stripped.length; i += 1) {
    const val = BASE32_ALPHABET.indexOf(stripped[i])
    if (val < 0)
      throw new Error('Invalid Base32 character')
    bits = (bits << 5) | val
    bitCount += 5
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bits >>> bitCount) & 0xFF)
      bits &= (1 << bitCount) - 1
    }
  }

  if (bytes.length === 0)
    throw new Error('Base32 seed decoded to zero bytes')

  return {
    bytes: Uint8Array.from(bytes),
    normalized: stripped,
  }
}

// =============================================================================
// 2. WebCrypto RFC 2104 HMAC & RFC 6238 / RFC 4226 TOTP Engine
// =============================================================================

async function computeHmac(algorithm, keyBytes, messageBytes) {
  const subtle = globalThis.crypto?.subtle

  // Path A: Standard WebCrypto `crypto.subtle.importKey` + `crypto.subtle.sign`
  if (typeof subtle?.importKey === 'function' && typeof subtle?.sign === 'function') {
    const cryptoKey = await subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: { name: algorithm } },
      false,
      ['sign'],
    )
    const signature = await subtle.sign('HMAC', cryptoKey, messageBytes)
    return new Uint8Array(signature)
  }

  // Path B: Tuff Prelude sandbox `crypto.subtle.digest` / `crypto.digest` (exact RFC 2104 HMAC)
  const digestFn = typeof subtle?.digest === 'function'
    ? (alg, bytes) => subtle.digest(alg, bytes)
    : typeof globalThis.crypto?.digest === 'function'
      ? (alg, bytes) => globalThis.crypto.digest(alg, bytes)
      : null

  if (!digestFn) {
    throw Object.assign(new Error('WebCrypto unavailable'), {
      code: 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE',
    })
  }

  const blockSize = algorithm === 'SHA-512' ? 128 : 64
  let key = keyBytes
  if (key.length > blockSize)
    key = new Uint8Array(await digestFn(algorithm, key))

  const paddedKey = new Uint8Array(blockSize)
  paddedKey.set(key)

  const inner = new Uint8Array(blockSize + messageBytes.length)
  for (let i = 0; i < blockSize; i += 1)
    inner[i] = paddedKey[i] ^ 0x36
  inner.set(messageBytes, blockSize)
  const innerHash = new Uint8Array(await digestFn(algorithm, inner))

  const outer = new Uint8Array(blockSize + innerHash.length)
  for (let i = 0; i < blockSize; i += 1)
    outer[i] = paddedKey[i] ^ 0x5C
  outer.set(innerHash, blockSize)
  return new Uint8Array(await digestFn(algorithm, outer))
}

async function generateTotp({ base32Seed, algorithm = 'SHA-1', digits = 6, period = 30, nowMs = Date.now() }) {
  const normAlgo = normalizeAlgorithm(algorithm)
  const normDigits = normalizeDigits(digits)
  const normPeriod = normalizePeriod(period)
  if (!normAlgo || !normDigits || !normPeriod)
    throw new Error('Invalid TOTP parameters')

  const { bytes: keyBytes } = decodeBase32(base32Seed)
  const epochSec = Math.floor(nowMs / 1000)
  const counter = Math.floor(epochSec / normPeriod)
  const elapsed = ((epochSec % normPeriod) + normPeriod) % normPeriod
  const remaining = normPeriod - elapsed

  const counterBuf = new ArrayBuffer(8)
  const view = new DataView(counterBuf)
  view.setBigUint64(0, BigInt(counter), false)

  const hmac = await computeHmac(normAlgo, keyBytes, new Uint8Array(counterBuf))
  const offset = hmac[hmac.length - 1] & 0x0F
  const binary = (
    ((hmac[offset] & 0x7F) << 24)
    | ((hmac[offset + 1] & 0xFF) << 16)
    | ((hmac[offset + 2] & 0xFF) << 8)
    | (hmac[offset + 3] & 0xFF)
  ) >>> 0

  const modulus = normDigits === 8 ? 100000000 : 1000000
  const code = String(binary % modulus).padStart(normDigits, '0')
  return { code, remaining, period: normPeriod, counter }
}

function formatCodeGrouped(code) {
  if (code.length === 6)
    return `${code.slice(0, 3)} ${code.slice(3)}`
  if (code.length === 8)
    return `${code.slice(0, 4)} ${code.slice(4)}`
  return code
}

function renderCountdownBar(remaining, period) {
  const width = 10
  const filled = Math.max(1, Math.min(width, Math.ceil((remaining / period) * width)))
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${remaining}s`
}

// =============================================================================
// 3. otpauth:// URI & Manual Add Parsers
// =============================================================================

function parseOtpAuthUri(raw) {
  const text = normalizeText(raw)
  if (!/^otpauth:\/\//i.test(text))
    return null

  const withoutScheme = text.slice('otpauth://'.length)
  const slashIdx = withoutScheme.indexOf('/')
  if (slashIdx <= 0)
    throw new Error('otpauth URI 缺少类型或账户标签')

  const otpType = withoutScheme.slice(0, slashIdx).toLowerCase()
  if (otpType !== 'totp')
    throw new Error(`仅支持 otpauth://totp/，当前类型为 ${otpType}`)

  const rest = withoutScheme.slice(slashIdx + 1)
  const qIdx = rest.indexOf('?')
  if (qIdx < 0)
    throw new Error('otpauth URI 缺少查询参数')

  const rawLabel = rest.slice(0, qIdx)
  const rawQuery = rest.slice(qIdx + 1)

  let decodedLabel = ''
  try {
    decodedLabel = decodeURIComponent(rawLabel)
  }
  catch {
    throw new Error('otpauth URI 标签编码无效')
  }

  const params = new URLSearchParams(rawQuery)
  const seedParam = params.get('secret')
  if (!seedParam)
    throw new Error('otpauth URI 缺少 secret 参数')
  const { normalized: base32Seed } = decodeBase32(seedParam)

  const algo = normalizeAlgorithm(params.get('algorithm') || 'SHA-1')
  if (!algo)
    throw new Error('不支持的哈希算法，仅支持 SHA1 / SHA256 / SHA512')

  const digits = normalizeDigits(params.get('digits') || '6')
  if (!digits)
    throw new Error('仅支持 6 位或 8 位动态码')

  const period = normalizePeriod(params.get('period') || '30')
  if (!period)
    throw new Error('周期必须在 15–300 秒之间')

  let issuer = normalizeText(params.get('issuer') || '')
  let label = normalizeText(decodedLabel)
  const colonIdx = label.indexOf(':')
  if (colonIdx > 0) {
    const prefix = normalizeText(label.slice(0, colonIdx))
    const suffix = normalizeText(label.slice(colonIdx + 1))
    if (!issuer)
      issuer = prefix
    label = suffix || prefix
  }
  if (!issuer)
    issuer = label || 'Account'
  if (!label)
    label = issuer

  return {
    issuer: issuer.slice(0, 64),
    label: label.slice(0, 96),
    base32Seed,
    algorithm: algo,
    digits,
    period,
  }
}

function parseManualAdd(raw) {
  const match = normalizeText(raw).match(/^(?:add|import|new|添加|新增)\s+(\S.*)$/i)
  if (!match)
    return null

  const body = match[1].trim()
  if (/^otpauth:\/\//i.test(body))
    return parseOtpAuthUri(body)

  const parts = body.split(/\s+/).filter(Boolean)
  const positional = []
  let algorithm = 'SHA-1'
  let digits = 6
  let period = 30

  for (const part of parts) {
    const kv = part.match(/^(algo|algorithm|digits|period)=(.+)$/i)
    if (kv) {
      const k = kv[1].toLowerCase()
      const v = kv[2]
      if (k === 'algo' || k === 'algorithm') {
        const parsedAlgo = normalizeAlgorithm(v)
        if (!parsedAlgo)
          throw new Error('仅支持 SHA1 / SHA256 / SHA512')
        algorithm = parsedAlgo
      }
      else if (k === 'digits') {
        const parsedDigits = normalizeDigits(v)
        if (!parsedDigits)
          throw new Error('仅支持 digits=6 或 digits=8')
        digits = parsedDigits
      }
      else if (k === 'period') {
        const parsedPeriod = normalizePeriod(v)
        if (!parsedPeriod)
          throw new Error('period 必须在 15–300 之间')
        period = parsedPeriod
      }
    }
    else {
      positional.push(part)
    }
  }

  if (positional.length < 2)
    throw new Error('格式: add <服务名> [账户] <Base32密钥> [digits=6|8] [period=30] [algo=SHA1|SHA256|SHA512]')

  let issuer
  let label
  let rawSeed
  if (positional.length === 2) {
    issuer = positional[0]
    label = positional[0]
    rawSeed = positional[1]
  }
  else {
    issuer = positional[0]
    label = positional[1]
    rawSeed = positional.slice(2).join('')
  }

  const { normalized: base32Seed } = decodeBase32(rawSeed)
  return {
    issuer: issuer.slice(0, 64),
    label: label.slice(0, 96),
    base32Seed,
    algorithm,
    digits,
    period,
  }
}

function registerDraft(draft) {
  const draftId = `draft_${generateAccountId()}`
  pendingDrafts.set(draftId, draft)
  while (pendingDrafts.size > MAX_PENDING_DRAFTS) {
    const oldest = pendingDrafts.keys().next().value
    if (oldest !== undefined)
      pendingDrafts.delete(oldest)
    else
      break
  }
  return draftId
}

// =============================================================================
// 4. Sanitized Non-Secret Metadata Store & Fail-Closed Secret Capability
// =============================================================================

function hasSecretCapability() {
  return (
    typeof secret?.get === 'function'
    && typeof secret?.set === 'function'
    && typeof secret?.delete === 'function'
  )
}

function sanitizeAccountMetadata(entry) {
  if (!entry || typeof entry !== 'object')
    return null
  const id = normalizeText(entry.id)
  const secretKey = normalizeText(entry.secretKey)
  const issuer = normalizeText(entry.issuer).slice(0, 64)
  const label = normalizeText(entry.label).slice(0, 96)
  const algorithm = normalizeAlgorithm(entry.algorithm || 'SHA-1')
  const digits = normalizeDigits(entry.digits ?? 6)
  const period = normalizePeriod(entry.period ?? 30)
  if (!id || !SECRET_KEY_RE.test(secretKey) || !issuer || !label || !algorithm || !digits || !period)
    return null
  // Explicitly project ONLY non-secret metadata fields — never retain secret/seed/uri!
  return {
    id,
    secretKey,
    issuer,
    label,
    algorithm,
    digits,
    period,
    createdAt: Number.isSafeInteger(entry.createdAt) && entry.createdAt >= 0 ? entry.createdAt : Date.now(),
  }
}

function parseMetadataStore(raw) {
  if (!raw)
    return { version: 1, accounts: [] }
  if (typeof raw === 'string') {
    try {
      return parseMetadataStore(JSON.parse(raw))
    }
    catch {
      return { version: 1, accounts: [] }
    }
  }
  const list = Array.isArray(raw?.accounts) ? raw.accounts : []
  const accounts = list
    .slice(0, MAX_ACCOUNTS)
    .map(sanitizeAccountMetadata)
    .filter(Boolean)
  return { version: 1, accounts }
}

async function loadAccounts() {
  if (typeof plugin?.storage?.getFile !== 'function')
    return []
  const raw = await plugin.storage.getFile(STORE_FILE)
  return parseMetadataStore(raw).accounts
}

async function saveAccounts(accounts) {
  if (typeof plugin?.storage?.setFile !== 'function') {
    throw Object.assign(new Error('Storage unavailable'), {
      code: 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE',
    })
  }
  const sanitized = accounts
    .slice(0, MAX_ACCOUNTS)
    .map(sanitizeAccountMetadata)
    .filter(Boolean)
  await plugin.storage.setFile(STORE_FILE, { version: 1, accounts: sanitized })
}

function mapHostError(error, fallbackReason, fallbackMessage) {
  const denied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
  const unavailable = error?.code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE'
  return {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: denied ? 'permission-denied' : unavailable ? 'capability-unavailable' : fallbackReason,
    message: denied
      ? '缺少执行该操作所需的权限'
      : unavailable
        ? '宿主安全能力暂不可用'
        : fallbackMessage,
  }
}

// Serialize read-modify-write metadata mutations so concurrent enrollments/deletes
// cannot drop an account or leave an orphaned secret in secure storage.
let metadataWriteQueue = Promise.resolve()

function serializeMetadataMutation(task) {
  const run = metadataWriteQueue.then(task, task)
  metadataWriteQueue = run.then(() => undefined, () => undefined)
  return run
}

// Fail-closed account enrollment: secret.set MUST succeed before touching plugin.storage!
function enrollAccountFailClosed(draft) {
  return serializeMetadataMutation(async () => {
    if (!hasSecretCapability()) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'capability-unavailable',
        message: '安全密钥存储不可用，已拒绝保存',
      }
    }

    let existingAccounts
    try {
      existingAccounts = await loadAccounts()
    }
    catch (error) {
      logger?.error?.('[touch-totp-vault] Failed to load existing accounts before save')
      return mapHostError(error, 'storage-read-failed', '读取账户列表失败，未保存新账户')
    }

    if (existingAccounts.length >= MAX_ACCOUNTS) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'account-limit-reached',
        message: `已达到最大账户数上限（${MAX_ACCOUNTS}），请先删除不需要的账户后再添加`,
      }
    }

    const accountId = generateAccountId()
    const secretKey = buildSecretKey(accountId)

    // Step 1: Write Base32 seed EXCLUSIVELY to host encrypted secret capability FIRST.
    try {
      await secret.set(secretKey, draft.base32Seed)
    }
    catch (error) {
      logger?.error?.('[touch-totp-vault] Failed to store secret')
      return mapHostError(error, 'secret-store-failed', '安全密钥写入失败，未保存账户配置')
    }

    // Step 2: Only after secret.set succeeded, persist sanitized metadata to plugin.storage.
    try {
      const metadata = sanitizeAccountMetadata({
        id: accountId,
        secretKey,
        issuer: draft.issuer,
        label: draft.label,
        algorithm: draft.algorithm,
        digits: draft.digits,
        period: draft.period,
        createdAt: Date.now(),
      })
      await saveAccounts([...existingAccounts, metadata])
      return {
        externalAction: true,
        success: true,
        status: 'started',
        message: `已安全保存 ${metadata.issuer} (${metadata.label})`,
      }
    }
    catch (error) {
      // Rollback orphan secret best-effort if metadata persistence failed
      try {
        await secret.delete(secretKey)
      }
      catch {
        logger?.warn?.('[touch-totp-vault] Failed to rollback secret after metadata failure')
      }
      logger?.error?.('[touch-totp-vault] Failed to save sanitized metadata')
      return mapHostError(error, 'action-failed', '账户元数据保存失败，已回滚密钥')
    }
  })
}

function deleteAccountFailClosed(accountId) {
  return serializeMetadataMutation(async () => {
    if (!hasSecretCapability()) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'capability-unavailable',
        message: '安全密钥存储不可用，无法删除密钥',
      }
    }

    const accounts = await loadAccounts()
    const target = accounts.find(a => a.id === accountId)
    if (!target) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'account-not-found',
        message: '未找到指定 2FA 账户',
      }
    }

    // Step 1: Delete from encrypted secret store FIRST (fail-closed)
    try {
      await secret.delete(target.secretKey)
    }
    catch (error) {
      logger?.error?.('[touch-totp-vault] Failed to delete secret')
      return mapHostError(error, 'secret-delete-failed', '删除安全密钥失败，已保留账户记录')
    }

    // Step 2: Remove sanitized metadata entry
    try {
      await saveAccounts(accounts.filter(a => a.id !== accountId))
      return {
        externalAction: true,
        success: true,
        status: 'started',
        message: `已移除 ${target.issuer} (${target.label})`,
      }
    }
    catch (error) {
      logger?.error?.('[touch-totp-vault] Failed to update metadata after delete')
      return mapHostError(error, 'action-failed', '更新账户列表失败')
    }
  })
}

// =============================================================================
// 5. Permission-Gated Clipboard Copy & Item Builders
// =============================================================================

async function ensurePermission(permissionId) {
  if (!permission || typeof permission.check !== 'function')
    return { granted: false, reason: 'permission-sdk-unavailable', message: '权限系统不可用' }
  try {
    if ((await permission.check(permissionId)) === true)
      return { granted: true, reason: '', message: '' }
    return { granted: false, reason: 'permission-denied', message: `缺少 ${permissionId} 权限` }
  }
  catch {
    logger?.warn?.('[touch-totp-vault] Permission check failed')
    return { granted: false, reason: 'permission-check-failed', message: '权限检查失败' }
  }
}

async function copyWithPermissionGate(text) {
  const perm = await ensurePermission('clipboard.write')
  if (!perm.granted) {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: perm.reason,
      message: perm.message,
    }
  }
  if (typeof clipboard?.writeText !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: '当前环境不支持写入剪贴板',
    }
  }
  try {
    await clipboard.writeText(String(text))
    return { externalAction: true, success: true, status: 'started', message: '已复制当前 2FA 动态码' }
  }
  catch (error) {
    logger?.error?.('[touch-totp-vault] Clipboard write failed')
    return mapHostError(error, 'clipboard-write-failed', '复制动态码失败')
  }
}

function buildItem({ id, featureId, title, subtitle, accessory, actions = [], defaultAction }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle || '')
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: defaultAction ?? (actions[0]?.id || 'none'),
    })
  if (accessory && typeof builder.setAccessory === 'function')
    builder.setAccessory(accessory)
  for (const action of actions)
    builder.createAndAddAction(action.id, 'plugin', action.label, action.payload)
  return builder.build()
}

async function renderVaultItems(featureId, filterText, deleteMode, isStale) {
  const accounts = await loadAccounts()
  if (isStale())
    return []

  const keyword = normalizeText(filterText).toLowerCase()
  const matched = keyword
    ? accounts.filter(a => `${a.issuer} ${a.label}`.toLowerCase().includes(keyword))
    : accounts

  if (!matched.length) {
    return [
      buildItem({
        id: `${featureId}-empty`,
        featureId,
        title: accounts.length ? `未找到匹配的 2FA 账户: ${filterText}` : '暂无已保存的 2FA 令牌',
        subtitle: '直接粘贴 otpauth://totp/... 链接，或输入 `add GitHub alice@example.com <BASE32>` 导入',
        accessory: 'Vault',
        actions: [],
        defaultAction: 'none',
      }),
    ]
  }

  const secretReady = hasSecretCapability()
  const nowMs = Date.now()
  const items = []

  for (const account of matched) {
    if (isStale())
      return []

    if (deleteMode) {
      items.push(buildItem({
        id: `${featureId}-del-${account.id}`,
        featureId,
        title: `删除 ${account.issuer} (${account.label})`,
        subtitle: `同时从加密 Secret 存储彻底销毁密钥 · ${account.algorithm} · ${account.digits}位/${account.period}s`,
        accessory: 'Delete',
        actions: [
          { id: 'delete-account', label: '确认删除令牌', payload: { accountId: account.id } },
        ],
        defaultAction: 'delete-account',
      }))
      continue
    }

    if (!secretReady) {
      items.push(buildItem({
        id: `${featureId}-unavail-${account.id}`,
        featureId,
        title: `${account.issuer} · 安全存储不可用`,
        subtitle: `${account.label} · 宿主 secret 能力不可用，无法解密生成验证码`,
        accessory: 'Locked',
        actions: [],
        defaultAction: 'none',
      }))
      continue
    }

    try {
      const seed = await secret.get(account.secretKey)
      if (isStale())
        return []
      if (!seed) {
        items.push(buildItem({
          id: `${featureId}-missing-${account.id}`,
          featureId,
          title: `${account.issuer} · 密钥缺失`,
          subtitle: `${account.label} · 加密存储中未找到对应密钥，可移除该条目后重新导入`,
          accessory: 'Missing',
          actions: [
            { id: 'delete-account', label: '移除失效条目', payload: { accountId: account.id } },
          ],
          defaultAction: 'delete-account',
        }))
        continue
      }

      const totp = await generateTotp({
        base32Seed: seed,
        algorithm: account.algorithm,
        digits: account.digits,
        period: account.period,
        nowMs,
      })
      if (isStale())
        return []

      const grouped = formatCodeGrouped(totp.code)
      const bar = renderCountdownBar(totp.remaining, totp.period)
      items.push(buildItem({
        id: `${featureId}-acct-${account.id}`,
        featureId,
        title: `${grouped}  ·  ${account.issuer}`,
        subtitle: `${account.label} · ${bar} · ${account.algorithm}`,
        accessory: `${totp.remaining}s`,
        actions: [
          // Recomputes live code on click using accountId so expired codes are never copied
          { id: 'copy-code', label: '复制动态码', payload: { accountId: account.id } },
          { id: 'delete-account', label: '删除令牌', payload: { accountId: account.id } },
        ],
        defaultAction: 'copy-code',
      }))
    }
    catch {
      logger?.warn?.('[touch-totp-vault] Failed to compute TOTP code for account')
      items.push(buildItem({
        id: `${featureId}-err-${account.id}`,
        featureId,
        title: `${account.issuer} · 计算失败`,
        subtitle: `${account.label} · 无法读取密钥或计算动态码`,
        accessory: 'Error',
        actions: [
          { id: 'delete-account', label: '删除令牌', payload: { accountId: account.id } },
        ],
        defaultAction: 'none',
      }))
    }
  }

  return items
}

async function publishItems(items, isStale) {
  if (isStale())
    return
  await plugin.feature.clearItems()
  if (isStale())
    return
  await plugin.feature.pushItems(items)
}

const pluginLifecycle = {
  async onInit() {
    destroyed = false
    if (typeof plugin?.storage?.getFile === 'function' && typeof plugin?.storage?.setFile === 'function') {
      try {
        const existing = await plugin.storage.getFile(STORE_FILE)
        if (!existing)
          await plugin.storage.setFile(STORE_FILE, { version: 1, accounts: [] })
      }
      catch {
        logger?.warn?.('[touch-totp-vault] Failed to initialize metadata storage')
      }
    }
  },

  async onFeatureTriggered(featureId, query, _feature, signal) {
    if (destroyed)
      return false
    const generation = ++activeGeneration
    const isStale = () => destroyed || generation !== activeGeneration || Boolean(signal?.aborted)

    try {
      const rawText = normalizeText(getQueryText(query))

      // 1. Direct otpauth://totp/... URI import OR manual `add ...` enrollment
      if (/^otpauth:\/\//i.test(rawText) || /^(?:add|import|new|添加|新增)\s+/i.test(rawText)) {
        const draft = /^otpauth:\/\//i.test(rawText)
          ? parseOtpAuthUri(rawText)
          : parseManualAdd(rawText)

        const preview = await generateTotp({
          base32Seed: draft.base32Seed,
          algorithm: draft.algorithm,
          digits: draft.digits,
          period: draft.period,
          nowMs: Date.now(),
        })
        if (isStale())
          return true

        // Keep raw Base32 seed strictly in memory — NEVER echo seed into item text or payload!
        const draftId = registerDraft(draft)
        const bar = renderCountdownBar(preview.remaining, preview.period)
        const items = [
          buildItem({
            id: `${featureId}-enroll-confirm`,
            featureId,
            title: `保存到加密令牌库: ${draft.issuer} (${draft.label})`,
            subtitle: `当前预览 ${formatCodeGrouped(preview.code)} · ${bar} · ${draft.algorithm} ${draft.digits}位/${draft.period}s · 密钥已脱敏 (••••)`,
            accessory: 'Save',
            actions: [
              { id: 'save-account', label: '安全保存到 Secret 存储', payload: { draftId } },
            ],
            defaultAction: 'save-account',
          }),
        ]
        await publishItems(items, isStale)
        return true
      }

      // 2. Delete mode (`delete <keyword>` / `remove <keyword>` / `删除 <keyword>`)
      const delMatch = rawText.match(/^(?:delete|remove|rm|删除|移除)(?:\s+(\S.*))?$/i)
      if (delMatch) {
        const items = await renderVaultItems(featureId, delMatch[1] || '', true, isStale)
        await publishItems(items, isStale)
        return true
      }

      // 3. List & filter saved accounts with live TOTP codes + countdown bar
      const items = await renderVaultItems(featureId, rawText, false, isStale)
      await publishItems(items, isStale)
      return true
    }
    catch (error) {
      if (isStale())
        return true
      const message = error instanceof Error ? error.message : '操作无法解析'
      try {
        await publishItems([
          buildItem({
            id: `${featureId}-input-error`,
            featureId,
            title: '2FA 输入格式无效',
            subtitle: message,
            accessory: 'Invalid',
            actions: [],
            defaultAction: 'none',
          }),
        ], isStale)
        return true
      }
      catch {
        logger?.error?.('[touch-totp-vault] Failed to publish fallback')
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (destroyed) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'cancelled',
        message: '插件已销毁',
      }
    }

    const actionId = context?.actionId || item?.meta?.defaultAction
    if (!actionId || actionId === 'none') {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: '该条目没有可执行操作',
      }
    }

    const action = Array.isArray(item?.actions)
      ? item.actions.find(entry => entry?.id === actionId)
      : null
    if (!action) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: '不支持的操作',
      }
    }

    const payload = action.payload || {}
    const featureId = item?.meta?.featureId || 'totp-vault'

    try {
      if (actionId === 'save-account') {
        const draftId = normalizeText(payload.draftId)
        const draft = draftId ? pendingDrafts.get(draftId) : null
        if (draftId)
          pendingDrafts.delete(draftId)
        if (!draft) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'stale-request',
            message: '待保存的导入会话已过期，请重新粘贴',
          }
        }
        const enrolled = await enrollAccountFailClosed(draft)
        if (enrolled.success) {
          const generation = ++activeGeneration
          const isStale = () => destroyed || generation !== activeGeneration
          const items = await renderVaultItems(featureId, '', false, isStale)
          await publishItems(items, isStale)
        }
        return enrolled
      }

      if (actionId === 'copy-code') {
        const accountId = normalizeText(payload.accountId)
        if (!accountId) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'invalid-action',
            message: '缺少账户标识',
          }
        }
        if (!hasSecretCapability()) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'capability-unavailable',
            message: '安全密钥存储不可用',
          }
        }
        const accounts = await loadAccounts()
        const account = accounts.find(a => a.id === accountId)
        if (!account) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'account-not-found',
            message: '未找到指定 2FA 账户',
          }
        }
        let seed
        try {
          seed = await secret.get(account.secretKey)
        }
        catch (error) {
          logger?.error?.('[touch-totp-vault] Failed to read secret for copy')
          return mapHostError(error, 'secret-read-failed', '读取安全密钥失败')
        }
        if (!seed) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'secret-missing',
            message: '加密存储中不存在该账户密钥',
          }
        }
        const totp = await generateTotp({
          base32Seed: seed,
          algorithm: account.algorithm,
          digits: account.digits,
          period: account.period,
          nowMs: Date.now(),
        })
        return await copyWithPermissionGate(totp.code)
      }

      if (actionId === 'delete-account') {
        const accountId = normalizeText(payload.accountId)
        if (!accountId) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'invalid-action',
            message: '缺少账户标识',
          }
        }
        const removed = await deleteAccountFailClosed(accountId)
        if (removed.success) {
          const generation = ++activeGeneration
          const isStale = () => destroyed || generation !== activeGeneration
          const items = await renderVaultItems(featureId, '', false, isStale)
          await publishItems(items, isStale)
        }
        return removed
      }

      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: '未知操作',
      }
    }
    catch (error) {
      logger?.error?.('[touch-totp-vault] Action failed')
      return mapHostError(error, 'action-failed', '操作失败')
    }
  },

  onDestroy() {
    destroyed = true
    activeGeneration += 1
    pendingDrafts.clear()
  },
}

module.exports = pluginLifecycle
