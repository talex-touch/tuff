import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inventoryPath = path.join(repoRoot, 'docs/engineering/sensitive-data-inventory.json')
const ROOT_KEYS = new Set(['schema', 'updatedAt', 'verificationCommand', 'entries'])
const ENTRY_KEYS = new Set([
  'id',
  'classification',
  'owner',
  'storageLocations',
  'writers',
  'readers',
  'exportPolicy',
  'deletionPolicy',
  'retentionPolicy',
  'rendererExposure',
  'portable',
  'migrationStatus',
  'evidence',
])
const STRING_FIELDS = [
  'classification',
  'owner',
  'exportPolicy',
  'deletionPolicy',
  'retentionPolicy',
  'rendererExposure',
  'migrationStatus',
]
const ARRAY_FIELDS = ['storageLocations', 'writers', 'readers', 'evidence']
const REQUIRED_IDS = new Set([
  'core-provider-credentials',
  'translation-provider-credentials',
  'nexus-auth-session',
  'sync-payload-key',
  'machine-seed',
  'clipboard-history',
  'ocr-history-and-assets',
  'search-history-and-usage',
  'intelligence-audit-context-memory',
  'analytics-telemetry-diagnostics',
  'plugin-ordinary-data',
  'plugin-secrets',
  'temporary-files',
])
const PORTABLE_IDS = new Set(['core-provider-credentials', 'translation-provider-credentials', 'plugin-secrets'])
const PORTABLE_PROVIDER_IDS = ['openai-default', 'anthropic-default', 'deepseek-default', 'siliconflow-default']
const TRANSLATION_SECRET_KEYS = [
  'providers.deepl.apiKey',
  'providers.bing.apiKey',
  'providers.custom.apiKey',
  'providers.baidu.secretKey',
  'providers.tencent.secretId',
  'providers.tencent.secretKey',
  'providers.caiyun.token',
]
const failures = []
const sourceCache = new Map()

function fail(message) {
  failures.push(message)
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`)
    return false
  }
  const actual = Object.keys(value)
  for (const key of actual) {
    if (!expected.has(key))
      fail(`${label} contains unsupported field ${key}`)
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key))
      fail(`${label} is missing ${key}`)
  }
  return true
}

function sourceText(relativePath) {
  if (sourceCache.has(relativePath))
    return sourceCache.get(relativePath)
  const absolutePath = path.join(repoRoot, relativePath)
  const raw = fs.readFileSync(absolutePath, 'utf8')
  const text = relativePath.endsWith('.vue')
    ? [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1])
        .join('\n')
    : raw
  sourceCache.set(relativePath, text)
  return text
}

function sourceFile(relativePath) {
  const kind = relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(relativePath, sourceText(relativePath), ts.ScriptTarget.Latest, true, kind)
}

function walk(node, visit) {
  if (visit(node) === false)
    return
  ts.forEachChild(node, child => walk(child, visit))
}

function declarationName(node) {
  if (
    ts.isFunctionDeclaration(node)
    || ts.isClassDeclaration(node)
    || ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isEnumDeclaration(node)
  ) {
    return node.name?.text
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
    return node.name.text
  return undefined
}

function hasSymbol(relativePath, expected) {
  let found = false
  walk(sourceFile(relativePath), (node) => {
    if (declarationName(node) === expected) {
      found = true
      return false
    }
  })
  return found
}

function hasTest(relativePath, expected) {
  let found = false
  walk(sourceFile(relativePath), (node) => {
    if (!ts.isCallExpression(node) || node.arguments.length === 0)
      return
    const callee = node.expression
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
    const title = node.arguments[0]
    if ((name === 'it' || name === 'test') && ts.isStringLiteral(title) && title.text === expected) {
      found = true
      return false
    }
  })
  return found
}

function hasHeading(relativePath, expected) {
  return read(relativePath)
    .split(/\r?\n/)
    .some(line => /^#{1,6}\s+/.test(line) && line.replace(/^#{1,6}\s+/, '').trim() === expected)
}

function verifyEvidence(reference, ownerId) {
  if (typeof reference !== 'string') {
    fail(`${ownerId} evidence must be a string`)
    return
  }
  const separator = reference.lastIndexOf('#')
  if (separator < 1) {
    fail(`${ownerId} evidence must include a structural anchor: ${reference}`)
    return
  }
  const relativePath = reference.slice(0, separator)
  const anchor = reference.slice(separator + 1)
  const absolutePath = path.join(repoRoot, relativePath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`${ownerId} evidence does not exist: ${relativePath}`)
    return
  }
  let valid = false
  if (anchor.startsWith('symbol=')) {
    valid = /\.(?:ts|tsx|vue)$/.test(relativePath) && hasSymbol(relativePath, anchor.slice(7))
  }
  else if (anchor.startsWith('test=')) {
    valid = /\.(?:ts|tsx)$/.test(relativePath) && hasTest(relativePath, anchor.slice(5))
  }
  else if (anchor.startsWith('heading=')) {
    valid = relativePath.endsWith('.md') && hasHeading(relativePath, anchor.slice(8))
  }
  else {
    fail(`${ownerId} evidence anchor type is unsupported: ${reference}`)
    return
  }
  if (!valid)
    fail(`${ownerId} evidence anchor was not found: ${reference}`)
}

function hasNamedImport(relativePath, moduleName, importedName) {
  let found = false
  walk(sourceFile(relativePath), (node) => {
    if (
      !ts.isImportDeclaration(node)
      || !ts.isStringLiteral(node.moduleSpecifier)
      || node.moduleSpecifier.text !== moduleName
    ) {
      return
    }
    const bindings = node.importClause?.namedBindings
    if (
      bindings
      && ts.isNamedImports(bindings)
      && bindings.elements.some(item => (item.propertyName?.text ?? item.name.text) === importedName)
    ) {
      found = true
      return false
    }
  })
  return found
}

function callName(node) {
  if (!ts.isCallExpression(node))
    return undefined
  if (ts.isIdentifier(node.expression))
    return node.expression.text
  if (ts.isPropertyAccessExpression(node.expression))
    return node.expression.name.text
  return undefined
}

function hasCall(relativePath, expected) {
  let found = false
  walk(sourceFile(relativePath), (node) => {
    if (callName(node) === expected) {
      found = true
      return false
    }
  })
  return found
}

function hasCallChain(relativePath, expected) {
  const parts = expected.split('.')
  let found = false
  walk(sourceFile(relativePath), (node) => {
    if (!ts.isCallExpression(node))
      return
    const names = []
    let expression = node.expression
    while (ts.isPropertyAccessExpression(expression)) {
      names.unshift(expression.name.text)
      expression = expression.expression
    }
    if (ts.isIdentifier(expression))
      names.unshift(expression.text)
    if (names.join('.') === parts.join('.')) {
      found = true
      return false
    }
  })
  return found
}

function hasObjectPropertyInCall(relativePath, targetCall, propertyName) {
  let found = false
  walk(sourceFile(relativePath), (node) => {
    if (!ts.isCallExpression(node) || callName(node) !== targetCall)
      return
    for (const argument of node.arguments) {
      if (
        ts.isObjectLiteralExpression(argument)
        && argument.properties.some(
          property =>
            (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
            && property.name?.getText(sourceFile(relativePath)).replaceAll(/["']/g, '') === propertyName,
        )
      ) {
        found = true
        return false
      }
    }
  })
  return found
}

function unwrapExpression(expression) {
  let current = expression
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression
  }
  return current
}

function stringArrayInitializer(relativePath, variableName) {
  let values
  walk(sourceFile(relativePath), (node) => {
    if (
      !ts.isVariableDeclaration(node)
      || !ts.isIdentifier(node.name)
      || node.name.text !== variableName
      || !node.initializer
    ) {
      return
    }
    const initializer = unwrapExpression(node.initializer)
    if (!ts.isArrayLiteralExpression(initializer))
      return
    if (initializer.elements.every(item => ts.isStringLiteral(item))) {
      values = initializer.elements.map(item => item.text)
      return false
    }
  })
  return values
}

function sameSet(actual, expected) {
  return (
    Array.isArray(actual)
    && actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every(value => actual.includes(value))
  )
}

let inventory
try {
  inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
}
catch {
  fail('inventory must be valid JSON')
  inventory = {}
}

exactKeys(inventory, ROOT_KEYS, 'inventory')
if (inventory.schema !== 'talex.touch.sensitive-data-inventory/v1') {
  fail('inventory schema must be talex.touch.sensitive-data-inventory/v1')
}
if (inventory.verificationCommand !== 'corepack pnpm privacy:inventory:verify') {
  fail('inventory verificationCommand must name the canonical verifier')
}
if (typeof inventory.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(inventory.updatedAt)) {
  fail('inventory updatedAt must be an ISO date')
}
if (!Array.isArray(inventory.entries) || inventory.entries.length !== REQUIRED_IDS.size) {
  fail(`inventory entries must contain exactly ${REQUIRED_IDS.size} canonical surfaces`)
}

const ids = new Set()
for (const [index, entry] of (inventory.entries ?? []).entries()) {
  const label = typeof entry?.id === 'string' ? entry.id : `entries[${index}]`
  if (!exactKeys(entry, ENTRY_KEYS, label))
    continue
  if (typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id)) {
    fail(`${label}.id must be a stable kebab-case string`)
    continue
  }
  if (!REQUIRED_IDS.has(entry.id))
    fail(`unknown inventory id: ${entry.id}`)
  if (ids.has(entry.id))
    fail(`duplicate inventory id: ${entry.id}`)
  ids.add(entry.id)
  for (const field of STRING_FIELDS) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) {
      fail(`${entry.id}.${field} must be a non-empty string`)
    }
  }
  for (const field of ARRAY_FIELDS) {
    const values = entry[field]
    if (
      !Array.isArray(values)
      || values.length === 0
      || values.some(value => typeof value !== 'string' || !value.trim())
      || new Set(values).size !== values.length
    ) {
      fail(`${entry.id}.${field} must be a non-empty unique string array`)
    }
  }
  if (typeof entry.portable !== 'boolean')
    fail(`${entry.id}.portable must be boolean`)
  if (entry.portable !== PORTABLE_IDS.has(entry.id)) {
    fail(`${entry.id}.portable does not match the approved portable surface set`)
  }
  if (entry.classification === 'credential') {
    if (!entry.storageLocations.some(location => location.includes('secure-store.json'))) {
      fail(`${entry.id} credential storage must name secure-store.json`)
    }
    if (!/none|transient|operation-local|sanitized|authRef|hasCredential/i.test(entry.rendererExposure)) {
      fail(`${entry.id} renderer exposure must explicitly describe credential redaction`)
    }
    if (/ordinary renderer storage receives (?:credential|secret|apiKey|token)/i.test(entry.rendererExposure)) {
      fail(`${entry.id} must not permit credential values in ordinary renderer storage`)
    }
  }
  for (const evidence of entry.evidence ?? []) verifyEvidence(evidence, entry.id)
}
for (const id of REQUIRED_IDS) {
  if (!ids.has(id))
    fail(`required inventory surface is missing: ${id}`)
}

const apiConfigPath = 'apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceApiConfig.vue'
if (!hasCall(apiConfigPath, 'saveProviderConfig')) {
  fail('IntelligenceApiConfig must call the typed saveProviderConfig SDK')
}
if (hasObjectPropertyInCall(apiConfigPath, 'updateProvider', 'apiKey')) {
  fail('IntelligenceApiConfig must not mirror apiKey into intelligenceSettings')
}

const providerRuntimePath = 'apps/core-app/src/main/modules/ai/provider-runtime.ts'
if (!hasNamedImport(providerRuntimePath, './provider-credential-runtime', 'resolveProviderCredential')) {
  fail('provider runtime must import secure main-side credential resolution')
}
if (!hasCall(providerRuntimePath, 'resolveProviderCredential')) {
  fail('provider runtime must call secure main-side credential resolution')
}

const intelligenceModulePath = 'apps/core-app/src/main/modules/ai/intelligence-module.ts'
for (const lifecycleCall of [
  'initializeProviderCredentialLifecycle',
  'shutdownProviderCredentialLifecycle',
  'saveProviderCredentialConfig',
  'deleteProviderCredentialConfig',
]) {
  if (!hasCall(intelligenceModulePath, lifecycleCall)) {
    fail(`IntelligenceModule lifecycle call is missing: ${lifecycleCall}`)
  }
}

const storageModulePath = 'apps/core-app/src/main/modules/storage/index.ts'
if (!hasCall(storageModulePath, 'providerConfigDocumentContainsCredential')) {
  fail('ordinary Intelligence storage must structurally reject credential-bearing documents')
}
if (!hasCall(storageModulePath, 'redactProviderConfigDocument')) {
  fail('ordinary Intelligence storage must structurally redact provider projections')
}

const translationStoragePath = 'apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts'
for (const call of [
  'migrateTranslationProviderCredentials',
  'isTranslationProviderConfigSafe',
  'isTranslationProviderSecretKey',
  'exactSecretEntries',
  'applySecureStoreBatch',
]) {
  if (!hasCall(translationStoragePath, call))
    fail(`Translation lifecycle call is missing: ${call}`)
}

const secretSdkPath = 'packages/utils/plugin/sdk/secret.ts'
if (!hasCall(secretSdkPath, 'normalizeSecretEntries')) {
  fail('Plugin Secret SDK must normalize exact batch entries before transport')
}

const portableCatalogPath = 'apps/core-app/src/main/modules/privacy/portable-secret-catalog.ts'
if (!sameSet(stringArrayInitializer(portableCatalogPath, 'PORTABLE_PROVIDER_IDS'), PORTABLE_PROVIDER_IDS)) {
  fail('portable Provider catalog must equal the approved fixed built-in IDs')
}
if (
  !sameSet(stringArrayInitializer(portableCatalogPath, 'TRANSLATION_PROVIDER_SECRET_KEYS'), TRANSLATION_SECRET_KEYS)
) {
  fail('portable Translation catalog must equal the approved fixed field set')
}

const privacyViewPath = 'apps/core-app/src/renderer/src/views/storage/PrivacyDataSection.vue'
if (!hasNamedImport(privacyViewPath, '@talex-touch/utils/transport/sdk/domains/privacy', 'createPrivacySdk')) {
  fail('PrivacyDataSection must import createPrivacySdk')
}
if (!hasCall(privacyViewPath, 'createPrivacySdk'))
  fail('PrivacyDataSection must call createPrivacySdk')
if (hasCall(privacyViewPath, 'send'))
  fail('PrivacyDataSection must not call raw transport.send')

const pluginInfoPath = 'apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue'
if (!hasCallChain(pluginInfoPath, 'pluginSDK.uninstall')) {
  fail('PluginInfo must call the typed pluginSDK.uninstall contract')
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2))
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      schema: inventory.schema,
      entries: inventory.entries.length,
      portableEntries: inventory.entries.filter(entry => entry.portable).length,
      nonPortableEntries: inventory.entries.filter(entry => !entry.portable).length,
      evidenceReferences: inventory.entries.reduce((sum, entry) => sum + entry.evidence.length, 0),
      evidenceAnchors: 'structural',
      sourceVerification: 'typescript-ast',
    },
    null,
    2,
  ),
)
