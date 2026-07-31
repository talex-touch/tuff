import { Buffer } from 'node:buffer'
import { types as utilTypes } from 'node:util'
import { PLUGIN_STORAGE_ERROR_CODES } from '@talex-touch/utils/transport/events/types'

export const PLUGIN_SQL_MAX_BYTES = 64 * 1024
export const PLUGIN_SQL_MAX_PARAMS = 256
export const PLUGIN_SQL_MAX_PARAM_BYTES = 1024 * 1024
export const PLUGIN_SQL_MAX_TRANSACTION_STATEMENTS = 64

export type PluginSqlLane = 'query' | 'execute' | 'transaction'

export type PluginSqlStatementType =
  | 'select'
  | 'insert'
  | 'update'
  | 'delete'
  | 'create-table'
  | 'create-index'
  | 'drop-table'
  | 'drop-index'
  | 'alter-table'

export interface PluginSqlPolicyDecision {
  lane: PluginSqlLane
  kind: PluginSqlStatementType
}

export interface PluginSqlTransactionStatement {
  sql: string
  params?: unknown[]
}

export type PluginSqlPolicyErrorCode =
  | typeof PLUGIN_STORAGE_ERROR_CODES.SQL_INVALID
  | typeof PLUGIN_STORAGE_ERROR_CODES.SQL_TOO_LARGE
  | typeof PLUGIN_STORAGE_ERROR_CODES.STATEMENT_DENIED
  | typeof PLUGIN_STORAGE_ERROR_CODES.STATEMENT_LIMIT
  | typeof PLUGIN_STORAGE_ERROR_CODES.PARAMS_TOO_LARGE

interface SqlToken {
  kind: 'word' | 'identifier' | 'literal' | 'symbol'
  value?: string
}

interface ScannedPluginSql {
  tokens: SqlToken[]
  terminalSemicolonIndex: number | null
}

const DENIED_WORDS = new Set([
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'VACUUM',
  'LOAD_EXTENSION',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
  'RETURNING',
  'WITH',
  'RECURSIVE',
  'ZEROBLOB',
  'RANDOMBLOB',
  'PRINTF',
  'TRIGGER',
  'VIEW'
])

function isDeniedWord(value: string): boolean {
  return DENIED_WORDS.has(value) || value.startsWith('PRAGMA_')
}

export class PluginSqlPolicyError extends Error {
  readonly code: PluginSqlPolicyErrorCode

  constructor(code: PluginSqlPolicyErrorCode, message: string) {
    super(message)
    this.name = 'PluginSqlPolicyError'
    this.code = code
  }
}

function rejectSql(code: PluginSqlPolicyErrorCode, message: string): never {
  throw new PluginSqlPolicyError(code, message)
}

function rejectInvalidSql(): never {
  return rejectSql(PLUGIN_STORAGE_ERROR_CODES.SQL_INVALID, 'Plugin SQL is invalid.')
}

function rejectDeniedStatement(): never {
  return rejectSql(
    PLUGIN_STORAGE_ERROR_CODES.STATEMENT_DENIED,
    'Plugin SQL statement is not allowed.'
  )
}

function rejectStatementLimit(): never {
  return rejectSql(
    PLUGIN_STORAGE_ERROR_CODES.STATEMENT_LIMIT,
    'Plugin SQL must contain exactly one statement.'
  )
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\w$]/.test(value)
}

function readWord(sql: string, start: number): string {
  let end = start
  while (isWordCharacter(sql[end])) end += 1
  return sql.slice(start, end).toUpperCase()
}

function consumeQuoted(sql: string, start: number, closingCharacter: string): number {
  let index = start + 1

  while (index < sql.length) {
    if (sql[index] !== closingCharacter) {
      index += 1
      continue
    }
    if (sql[index + 1] === closingCharacter) {
      index += 2
      continue
    }
    return index + 1
  }

  return rejectInvalidSql()
}

function scanPluginSql(sql: string): ScannedPluginSql {
  const tokens: SqlToken[] = []
  let currentWord = ''
  let statementEnded = false
  let terminalSemicolonIndex: number | null = null
  let index = 0

  const flushWord = (): void => {
    if (!currentWord) return
    const value = currentWord.toUpperCase()
    currentWord = ''
    if (isDeniedWord(value)) rejectDeniedStatement()
    tokens.push({ kind: 'word', value })
  }

  while (index < sql.length) {
    const character = sql[index]
    const nextCharacter = sql[index + 1]

    if (character === '-' && nextCharacter === '-') {
      flushWord()
      index += 2
      while (index < sql.length && sql[index] !== '\n' && sql[index] !== '\r') {
        index += 1
      }
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      const prefix = currentWord
      flushWord()
      const commentEnd = sql.indexOf('*/', index + 2)
      if (commentEnd < 0) rejectInvalidSql()
      index = commentEnd + 2
      if (prefix && isDeniedWord(`${prefix}${readWord(sql, index)}`.toUpperCase())) {
        rejectDeniedStatement()
      }
      continue
    }

    if (/\s/.test(character)) {
      flushWord()
      index += 1
      continue
    }

    if (character === ';') {
      flushWord()
      if (statementEnded || tokens.length === 0) rejectStatementLimit()
      statementEnded = true
      terminalSemicolonIndex = index
      index += 1
      continue
    }

    if (statementEnded) rejectStatementLimit()

    if (character === "'") {
      flushWord()
      index = consumeQuoted(sql, index, "'")
      tokens.push({ kind: 'literal' })
      continue
    }

    if (character === '"' || character === '`') {
      flushWord()
      const identifierEnd = consumeQuoted(sql, index, character)
      const value = sql
        .slice(index + 1, identifierEnd - 1)
        .replaceAll(`${character}${character}`, character)
        .toUpperCase()
      if (isDeniedWord(value)) rejectDeniedStatement()
      index = identifierEnd
      tokens.push({ kind: 'identifier', value })
      continue
    }

    if (character === '[') {
      flushWord()
      const identifierEnd = consumeQuoted(sql, index, ']')
      const value = sql
        .slice(index + 1, identifierEnd - 1)
        .replaceAll(']]', ']')
        .toUpperCase()
      if (isDeniedWord(value)) rejectDeniedStatement()
      index = identifierEnd
      tokens.push({ kind: 'identifier', value })
      continue
    }

    if (isWordCharacter(character)) {
      currentWord += character
      index += 1
      continue
    }

    flushWord()
    tokens.push({ kind: 'symbol', value: character })
    index += 1
  }

  flushWord()
  if (tokens.length === 0) rejectInvalidSql()

  for (let tokenIndex = 0; tokenIndex < tokens.length - 1; tokenIndex += 1) {
    if (wordAt(tokens, tokenIndex) === 'VIRTUAL' && wordAt(tokens, tokenIndex + 1) === 'TABLE') {
      rejectDeniedStatement()
    }
  }

  return { tokens, terminalSemicolonIndex }
}

function wordAt(tokens: SqlToken[], index: number): string | undefined {
  const token = tokens[index]
  return token?.kind === 'word' ? token.value : undefined
}

function isIdentifierAt(tokens: SqlToken[], index: number): boolean {
  const token = tokens[index]
  return token?.kind === 'word' || token?.kind === 'identifier'
}

function resolveDdlObjectIndex(
  tokens: SqlToken[],
  start: number,
  optionalWords: readonly string[]
): number {
  const matchesOptionalWords = optionalWords.every(
    (word, offset) => wordAt(tokens, start + offset) === word
  )
  if (wordAt(tokens, start) === 'IF' && !matchesOptionalWords) {
    return rejectDeniedStatement()
  }
  return matchesOptionalWords ? start + optionalWords.length : start
}

function classifyAlterTable(tokens: SqlToken[]): PluginSqlStatementType {
  if (wordAt(tokens, 1) !== 'TABLE' || !isIdentifierAt(tokens, 2)) {
    return rejectDeniedStatement()
  }

  const operation = wordAt(tokens, 3)
  if (operation === 'RENAME') {
    if (wordAt(tokens, 4) === 'TO' && isIdentifierAt(tokens, 5) && tokens.length === 6) {
      return 'alter-table'
    }
    if (
      wordAt(tokens, 4) === 'COLUMN' &&
      isIdentifierAt(tokens, 5) &&
      wordAt(tokens, 6) === 'TO' &&
      isIdentifierAt(tokens, 7) &&
      tokens.length === 8
    ) {
      return 'alter-table'
    }
    return rejectDeniedStatement()
  }

  if (operation === 'ADD') {
    const columnIndex = wordAt(tokens, 4) === 'COLUMN' ? 5 : 4
    return isIdentifierAt(tokens, columnIndex) ? 'alter-table' : rejectDeniedStatement()
  }

  if (operation === 'DROP') {
    const columnIndex = wordAt(tokens, 4) === 'COLUMN' ? 5 : 4
    return isIdentifierAt(tokens, columnIndex) && tokens.length === columnIndex + 1
      ? 'alter-table'
      : rejectDeniedStatement()
  }

  return rejectDeniedStatement()
}

function classifyMutation(tokens: SqlToken[]): PluginSqlStatementType {
  const firstWord = wordAt(tokens, 0)
  if (firstWord === 'INSERT') return 'insert'
  if (firstWord === 'UPDATE') return 'update'
  if (firstWord === 'DELETE') return 'delete'
  if (firstWord === 'ALTER') return classifyAlterTable(tokens)

  if (firstWord === 'CREATE' || firstWord === 'DROP') {
    const objectType = wordAt(tokens, 1)
    if (objectType !== 'TABLE' && objectType !== 'INDEX') {
      return rejectDeniedStatement()
    }

    const objectIndex = resolveDdlObjectIndex(
      tokens,
      2,
      firstWord === 'CREATE' ? ['IF', 'NOT', 'EXISTS'] : ['IF', 'EXISTS']
    )
    if (!isIdentifierAt(tokens, objectIndex)) rejectDeniedStatement()

    if (firstWord === 'CREATE') {
      return objectType === 'TABLE' ? 'create-table' : 'create-index'
    }
    return objectType === 'TABLE' ? 'drop-table' : 'drop-index'
  }

  return rejectDeniedStatement()
}

export function validatePluginSql(sql: unknown, lane: PluginSqlLane): PluginSqlPolicyDecision {
  if (typeof sql !== 'string') return rejectInvalidSql()
  if (sql.includes('\0')) return rejectInvalidSql()
  if (Buffer.byteLength(sql, 'utf8') > PLUGIN_SQL_MAX_BYTES) {
    return rejectSql(PLUGIN_STORAGE_ERROR_CODES.SQL_TOO_LARGE, 'Plugin SQL exceeds the size limit.')
  }

  const { tokens } = scanPluginSql(sql)
  if (lane === 'query') {
    if (wordAt(tokens, 0) !== 'SELECT') rejectDeniedStatement()
    return { lane, kind: 'select' }
  }

  return { lane, kind: classifyMutation(tokens) }
}

export function normalizePluginSqlForExecution(sql: string): string {
  const { terminalSemicolonIndex } = scanPluginSql(sql)
  return (terminalSemicolonIndex === null ? sql : sql.slice(0, terminalSemicolonIndex)).trim()
}

const SQL_PARAM_FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function snapshotSqlParam(
  value: unknown,
  ancestors = new WeakSet<object>(),
  depth = 0,
  budget = { members: 0 }
): unknown {
  if (depth > 16) rejectInvalidSql()
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) rejectInvalidSql()
    return value
  }
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) rejectInvalidSql()
  if (value instanceof Date) {
    const timestamp = value.getTime()
    if (!Number.isFinite(timestamp)) rejectInvalidSql()
    return new Date(timestamp)
  }
  if (value instanceof ArrayBuffer) return value.slice(0)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
  }
  if (ancestors.has(value)) rejectInvalidSql()
  ancestors.add(value)
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Array.isArray(value)) {
      const lengthDescriptor = descriptors.length
      const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1
      if (!Number.isSafeInteger(length) || length < 0) rejectInvalidSql()
      const output: unknown[] = []
      const allowedKeys = new Set<PropertyKey>(['length'])
      for (let index = 0; index < length; index += 1) {
        const key = String(index)
        allowedKeys.add(key)
        const descriptor = descriptors[key]
        if (!descriptor?.enumerable || !('value' in descriptor)) rejectInvalidSql()
        budget.members += 1
        if (budget.members > 10_000) rejectInvalidSql()
        const entry = snapshotSqlParam(descriptor.value, ancestors, depth + 1, budget)
        if (entry === undefined || typeof entry === 'bigint') rejectInvalidSql()
        output.push(entry)
      }
      if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) rejectInvalidSql()
      return output
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) rejectInvalidSql()
    const output: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string' || SQL_PARAM_FORBIDDEN_KEYS.has(key)) rejectInvalidSql()
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !('value' in descriptor)) rejectInvalidSql()
      budget.members += 1
      if (budget.members > 10_000) rejectInvalidSql()
      const entry = snapshotSqlParam(descriptor.value, ancestors, depth + 1, budget)
      if (entry === undefined || typeof entry === 'bigint') rejectInvalidSql()
      output[key] = entry
    }
    return output
  } finally {
    ancestors.delete(value)
  }
}

function snapshotSqlParams(params: unknown): unknown[] {
  if (!Array.isArray(params) || utilTypes.isProxy(params)) {
    return rejectSql(
      PLUGIN_STORAGE_ERROR_CODES.PARAMS_TOO_LARGE,
      'Plugin SQL parameters exceed the allowed limits.'
    )
  }
  const descriptors = Object.getOwnPropertyDescriptors(params) as unknown as Record<
    string,
    PropertyDescriptor | undefined
  >
  const lengthDescriptor = descriptors['length']
  const rawLength = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1
  if (
    !Number.isSafeInteger(rawLength) ||
    Number(rawLength) < 0 ||
    Number(rawLength) > PLUGIN_SQL_MAX_PARAMS
  ) {
    return rejectSql(
      PLUGIN_STORAGE_ERROR_CODES.PARAMS_TOO_LARGE,
      'Plugin SQL parameters exceed the allowed limits.'
    )
  }
  const length = Number(rawLength)
  const output: unknown[] = []
  const allowedKeys = new Set<PropertyKey>(['length'])
  for (let index = 0; index < length; index += 1) {
    const key = String(index)
    allowedKeys.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) rejectInvalidSql()
    output.push(snapshotSqlParam(descriptor.value))
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) rejectInvalidSql()
  return output
}

function getParamByteLength(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8')
  if (typeof value === 'number' || typeof value === 'bigint') return 8
  if (typeof value === 'boolean') return 1
  if (value instanceof Date) return Buffer.byteLength(value.toISOString(), 'utf8')
  if (value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength

  try {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return serialized === undefined ? 0 : Buffer.byteLength(serialized, 'utf8')
  } catch {
    return rejectSql(
      PLUGIN_STORAGE_ERROR_CODES.PARAMS_TOO_LARGE,
      'Plugin SQL parameters exceed the allowed limits.'
    )
  }
}

export function validatePluginSqlParams(params: unknown): unknown[] {
  if (params === undefined) return []
  const normalized = snapshotSqlParams(params)

  let totalBytes = 0
  for (const value of normalized) {
    totalBytes += getParamByteLength(value)
    if (totalBytes > PLUGIN_SQL_MAX_PARAM_BYTES) {
      return rejectSql(
        PLUGIN_STORAGE_ERROR_CODES.PARAMS_TOO_LARGE,
        'Plugin SQL parameters exceed the allowed limits.'
      )
    }
  }

  return normalized
}

function isTransactionStatement(value: unknown): value is PluginSqlTransactionStatement {
  if (!value || typeof value !== 'object') return false
  const statement = value as { sql?: unknown; params?: unknown }
  return (
    typeof statement.sql === 'string' &&
    (statement.params === undefined || Array.isArray(statement.params))
  )
}

export function validatePluginTransactionStatements(
  statements: unknown
): PluginSqlTransactionStatement[] {
  if (
    !Array.isArray(statements) ||
    statements.length === 0 ||
    statements.length > PLUGIN_SQL_MAX_TRANSACTION_STATEMENTS
  ) {
    return rejectStatementLimit()
  }

  let totalParamCount = 0
  let totalParamBytes = 0
  for (const statement of statements) {
    if (!isTransactionStatement(statement)) rejectInvalidSql()
    validatePluginSql(statement.sql, 'transaction')
    const params = validatePluginSqlParams(statement.params)
    totalParamCount += params.length
    for (const value of params) totalParamBytes += getParamByteLength(value)
    if (totalParamCount > PLUGIN_SQL_MAX_PARAMS || totalParamBytes > PLUGIN_SQL_MAX_PARAM_BYTES) {
      return rejectSql(
        PLUGIN_STORAGE_ERROR_CODES.PARAMS_TOO_LARGE,
        'Plugin SQL transaction parameters exceed the allowed limits.'
      )
    }
  }

  return statements
}
