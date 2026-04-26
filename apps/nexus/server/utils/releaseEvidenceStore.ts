import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const RUNS_TABLE = 'release_evidence_runs'
const ITEMS_TABLE = 'release_evidence_items'
const EVIDENCE_JSON_LIMIT_BYTES = 128 * 1024

const initializedSchemas = new WeakSet<D1Database>()

export const RELEASE_EVIDENCE_PLATFORMS = ['windows', 'macos', 'linux', 'all'] as const
export const RELEASE_EVIDENCE_SCOPES = ['core-app', 'pilot', 'nexus', 'docs', 'release'] as const
export const RELEASE_EVIDENCE_RUN_STATUSES = ['running', 'passed', 'failed', 'partial'] as const
export const RELEASE_EVIDENCE_ITEM_STATUSES = ['pending', 'passed', 'failed', 'blocked', 'best_effort', 'skipped'] as const

export type ReleaseEvidencePlatform = typeof RELEASE_EVIDENCE_PLATFORMS[number]
export type ReleaseEvidenceScope = typeof RELEASE_EVIDENCE_SCOPES[number]
export type ReleaseEvidenceRunStatus = typeof RELEASE_EVIDENCE_RUN_STATUSES[number]
export type ReleaseEvidenceItemStatus = typeof RELEASE_EVIDENCE_ITEM_STATUSES[number]

export interface ReleaseEvidenceRun {
  id: string
  version: string
  platform: ReleaseEvidencePlatform
  scope: ReleaseEvidenceScope
  status: ReleaseEvidenceRunStatus
  createdBy: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ReleaseEvidenceItem {
  id: string
  runId: string
  category: string
  caseId: string
  status: ReleaseEvidenceItemStatus
  requiredForRelease: boolean
  evidence: Record<string, unknown>
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface ReleaseEvidenceRunRow {
  id: string
  version: string
  platform: string
  scope: string
  status: string
  created_by: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface ReleaseEvidenceItemRow {
  id: string
  run_id: string
  category: string
  case_id: string
  status: string
  required_for_release: number
  evidence_json: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreateReleaseEvidenceRunInput {
  version: string
  platform: ReleaseEvidencePlatform
  scope: ReleaseEvidenceScope
  status?: ReleaseEvidenceRunStatus
  createdBy: string
  notes?: string | null
}

export interface UpsertReleaseEvidenceItemInput {
  category: string
  caseId: string
  status: ReleaseEvidenceItemStatus
  requiredForRelease?: boolean
  evidence?: Record<string, unknown>
  notes?: string | null
}

export interface ListReleaseEvidenceRunsOptions {
  version?: string
  platform?: ReleaseEvidencePlatform
  scope?: ReleaseEvidenceScope
  status?: ReleaseEvidenceRunStatus
  page?: number
  limit?: number
}

export interface ReleaseEvidenceRunDetail {
  run: ReleaseEvidenceRun
  items: ReleaseEvidenceItem[]
}

export interface ReleaseEvidenceRunList {
  runs: ReleaseEvidenceRun[]
  page: number
  limit: number
  total: number
}

export interface ReleaseEvidenceMatrixEntry {
  id: string
  runId: string
  platform: ReleaseEvidencePlatform
  scope: ReleaseEvidenceScope
  category: string
  caseId: string
  status: ReleaseEvidenceItemStatus
  requiredForRelease: boolean
  evidence: Record<string, unknown>
  notes: string | null
  updatedAt: string
}

export interface ReleaseEvidencePlatformMatrix {
  status: 'pending' | 'passed' | 'blocked' | 'partial' | 'best_effort'
  total: number
  required: number
  passed: number
  failed: number
  blocked: number
  pending: number
  bestEffort: number
  skipped: number
  blockingItems: ReleaseEvidenceMatrixEntry[]
}

export interface ReleaseEvidenceMatrix {
  version: string
  generatedAt: string
  summary: {
    total: number
    required: number
    passed: number
    failed: number
    blocked: number
    pending: number
    bestEffort: number
    skipped: number
    blocking: number
  }
  platforms: Record<ReleaseEvidencePlatform, ReleaseEvidencePlatformMatrix>
  blockers: ReleaseEvidenceMatrixEntry[]
  docsGuard: ReleaseEvidenceMatrixEntry | null
}

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

async function ensureReleaseEvidenceSchema(db: D1Database) {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RUNS_TABLE} (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      platform TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${ITEMS_TABLE} (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      category TEXT NOT NULL,
      case_id TEXT NOT NULL,
      status TEXT NOT NULL,
      required_for_release INTEGER NOT NULL DEFAULT 1,
      evidence_json TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(run_id, case_id),
      FOREIGN KEY (run_id) REFERENCES ${RUNS_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_evidence_runs_version ON ${RUNS_TABLE}(version);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_evidence_runs_filters ON ${RUNS_TABLE}(version, platform, scope, status);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_evidence_items_run_id ON ${ITEMS_TABLE}(run_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_evidence_items_case_id ON ${ITEMS_TABLE}(case_id);`).run()

  initializedSchemas.add(db)
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} is required.` })
  }
  return value.trim()
}

function assertEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value as T
}

function normalizeNotes(value: unknown): string | null {
  if (value == null)
    return null
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'notes is invalid.' })
  }
  return value.trim() || null
}

function normalizeEvidence(value: unknown): { data: Record<string, unknown>, json: string } {
  const evidence = value === undefined ? {} : value
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw createError({ statusCode: 400, statusMessage: 'evidence must be a JSON object.' })
  }

  const json = JSON.stringify(evidence)
  const size = new TextEncoder().encode(json).length
  if (size > EVIDENCE_JSON_LIMIT_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'evidence exceeds 128KB.' })
  }

  return { data: evidence as Record<string, unknown>, json }
}

function parseEvidenceJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, unknown>
  }
  catch {
    return {}
  }
}

function mapRun(row: ReleaseEvidenceRunRow): ReleaseEvidenceRun {
  return {
    id: row.id,
    version: row.version,
    platform: row.platform as ReleaseEvidencePlatform,
    scope: row.scope as ReleaseEvidenceScope,
    status: row.status as ReleaseEvidenceRunStatus,
    createdBy: row.created_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapItem(row: ReleaseEvidenceItemRow): ReleaseEvidenceItem {
  return {
    id: row.id,
    runId: row.run_id,
    category: row.category,
    caseId: row.case_id,
    status: row.status as ReleaseEvidenceItemStatus,
    requiredForRelease: Boolean(row.required_for_release),
    evidence: parseEvidenceJson(row.evidence_json),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildRunWhere(options: ListReleaseEvidenceRunsOptions) {
  const conditions: string[] = []
  const values: string[] = []

  if (options.version) {
    conditions.push('version = ?')
    values.push(options.version)
  }
  if (options.platform) {
    conditions.push('platform = ?')
    values.push(options.platform)
  }
  if (options.scope) {
    conditions.push('scope = ?')
    values.push(options.scope)
  }
  if (options.status) {
    conditions.push('status = ?')
    values.push(options.status)
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  }
}

function clampPagination(page?: number, limit?: number) {
  const safePage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1
  const safeLimit = Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 50
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

export async function createReleaseEvidenceRun(
  event: H3Event,
  input: CreateReleaseEvidenceRunInput,
): Promise<ReleaseEvidenceRun> {
  const db = getD1Database(event)
  await ensureReleaseEvidenceSchema(db)

  const id = randomUUID()
  const now = new Date().toISOString()
  const version = assertNonEmptyString(input.version, 'version')
  const platform = assertEnum(input.platform, 'platform', RELEASE_EVIDENCE_PLATFORMS)
  const scope = assertEnum(input.scope, 'scope', RELEASE_EVIDENCE_SCOPES)
  const status = input.status
    ? assertEnum(input.status, 'status', RELEASE_EVIDENCE_RUN_STATUSES)
    : 'running'
  const createdBy = assertNonEmptyString(input.createdBy, 'createdBy')
  const notes = normalizeNotes(input.notes)

  await db.prepare(`
    INSERT INTO ${RUNS_TABLE} (
      id, version, platform, scope, status, created_by, notes, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);
  `).bind(id, version, platform, scope, status, createdBy, notes, now, now).run()

  return {
    id,
    version,
    platform,
    scope,
    status,
    createdBy,
    notes,
    createdAt: now,
    updatedAt: now,
  }
}

export async function listReleaseEvidenceRuns(
  event: H3Event,
  options: ListReleaseEvidenceRunsOptions = {},
): Promise<ReleaseEvidenceRunList> {
  const db = getD1Database(event)
  await ensureReleaseEvidenceSchema(db)

  if (options.version)
    options.version = assertNonEmptyString(options.version, 'version')
  if (options.platform)
    assertEnum(options.platform, 'platform', RELEASE_EVIDENCE_PLATFORMS)
  if (options.scope)
    assertEnum(options.scope, 'scope', RELEASE_EVIDENCE_SCOPES)
  if (options.status)
    assertEnum(options.status, 'status', RELEASE_EVIDENCE_RUN_STATUSES)

  const { clause, values } = buildRunWhere(options)
  const { page, limit, offset } = clampPagination(options.page, options.limit)

  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${RUNS_TABLE}
    ${clause};
  `).bind(...values).first<{ total: number }>()

  const { results } = await db.prepare(`
    SELECT id, version, platform, scope, status, created_by, notes, created_at, updated_at
    FROM ${RUNS_TABLE}
    ${clause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?;
  `).bind(...values, limit, offset).all<ReleaseEvidenceRunRow>()

  return {
    runs: (results ?? []).map(mapRun),
    page,
    limit,
    total: Number(countRow?.total ?? 0),
  }
}

export async function getReleaseEvidenceRun(
  event: H3Event,
  runId: string,
): Promise<ReleaseEvidenceRunDetail | null> {
  const db = getD1Database(event)
  await ensureReleaseEvidenceSchema(db)

  const id = assertNonEmptyString(runId, 'runId')
  const runRow = await db.prepare(`
    SELECT id, version, platform, scope, status, created_by, notes, created_at, updated_at
    FROM ${RUNS_TABLE}
    WHERE id = ?;
  `).bind(id).first<ReleaseEvidenceRunRow>()

  if (!runRow)
    return null

  const { results } = await db.prepare(`
    SELECT id, run_id, category, case_id, status, required_for_release, evidence_json, notes, created_at, updated_at
    FROM ${ITEMS_TABLE}
    WHERE run_id = ?
    ORDER BY updated_at DESC;
  `).bind(id).all<ReleaseEvidenceItemRow>()

  return {
    run: mapRun(runRow),
    items: (results ?? []).map(mapItem),
  }
}

export async function upsertReleaseEvidenceItem(
  event: H3Event,
  runId: string,
  input: UpsertReleaseEvidenceItemInput,
): Promise<ReleaseEvidenceItem> {
  const db = getD1Database(event)
  await ensureReleaseEvidenceSchema(db)

  const safeRunId = assertNonEmptyString(runId, 'runId')
  const run = await getReleaseEvidenceRun(event, safeRunId)
  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'Release evidence run not found.' })
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  const category = assertNonEmptyString(input.category, 'category')
  const caseId = assertNonEmptyString(input.caseId, 'caseId')
  const status = assertEnum(input.status, 'status', RELEASE_EVIDENCE_ITEM_STATUSES)
  const requiredForRelease = input.requiredForRelease ?? true
  const { data: evidence, json: evidenceJson } = normalizeEvidence(input.evidence)
  const notes = normalizeNotes(input.notes)

  if (typeof requiredForRelease !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'requiredForRelease is invalid.' })
  }

  await db.prepare(`
    INSERT INTO ${ITEMS_TABLE} (
      id, run_id, category, case_id, status, required_for_release, evidence_json, notes, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT(run_id, case_id) DO UPDATE SET
      category = excluded.category,
      status = excluded.status,
      required_for_release = excluded.required_for_release,
      evidence_json = excluded.evidence_json,
      notes = excluded.notes,
      updated_at = excluded.updated_at;
  `).bind(
    id,
    safeRunId,
    category,
    caseId,
    status,
    requiredForRelease ? 1 : 0,
    evidenceJson,
    notes,
    now,
    now,
  ).run()

  const row = await db.prepare(`
    SELECT id, run_id, category, case_id, status, required_for_release, evidence_json, notes, created_at, updated_at
    FROM ${ITEMS_TABLE}
    WHERE run_id = ? AND case_id = ?;
  `).bind(safeRunId, caseId).first<ReleaseEvidenceItemRow>()

  return row
    ? mapItem(row)
    : {
        id,
        runId: safeRunId,
        category,
        caseId,
        status,
        requiredForRelease,
        evidence,
        notes,
        createdAt: now,
        updatedAt: now,
      }
}

function createEmptyPlatformMatrix(): ReleaseEvidencePlatformMatrix {
  return {
    status: 'pending',
    total: 0,
    required: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    pending: 0,
    bestEffort: 0,
    skipped: 0,
    blockingItems: [],
  }
}

function toMatrixEntry(run: ReleaseEvidenceRun, item: ReleaseEvidenceItem): ReleaseEvidenceMatrixEntry {
  return {
    id: item.id,
    runId: run.id,
    platform: run.platform,
    scope: run.scope,
    category: item.category,
    caseId: item.caseId,
    status: item.status,
    requiredForRelease: item.requiredForRelease,
    evidence: item.evidence,
    notes: item.notes,
    updatedAt: item.updatedAt,
  }
}

function isBlockingItem(entry: ReleaseEvidenceMatrixEntry): boolean {
  return entry.requiredForRelease && ['failed', 'blocked', 'pending', 'skipped'].includes(entry.status)
}

function finalizePlatformMatrix(matrix: ReleaseEvidencePlatformMatrix) {
  if (matrix.blockingItems.length > 0) {
    matrix.status = 'blocked'
  }
  else if (matrix.total === 0) {
    matrix.status = 'pending'
  }
  else if (matrix.required === 0 && matrix.bestEffort > 0) {
    matrix.status = 'best_effort'
  }
  else if (matrix.required > 0 && matrix.passed >= matrix.required) {
    matrix.status = 'passed'
  }
  else {
    matrix.status = 'partial'
  }
}

export async function getReleaseEvidenceMatrix(
  event: H3Event,
  version: string,
): Promise<ReleaseEvidenceMatrix> {
  const safeVersion = assertNonEmptyString(version, 'version')
  const db = getD1Database(event)
  await ensureReleaseEvidenceSchema(db)

  const { results: runRows } = await db.prepare(`
    SELECT id, version, platform, scope, status, created_by, notes, created_at, updated_at
    FROM ${RUNS_TABLE}
    WHERE version = ?
    ORDER BY updated_at DESC;
  `).bind(safeVersion).all<ReleaseEvidenceRunRow>()
  const runs = (runRows ?? []).map(mapRun)
  const platforms: Record<ReleaseEvidencePlatform, ReleaseEvidencePlatformMatrix> = {
    windows: createEmptyPlatformMatrix(),
    macos: createEmptyPlatformMatrix(),
    linux: createEmptyPlatformMatrix(),
    all: createEmptyPlatformMatrix(),
  }

  const summary = {
    total: 0,
    required: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    pending: 0,
    bestEffort: 0,
    skipped: 0,
    blocking: 0,
  }

  if (runs.length === 0) {
    return {
      version: safeVersion,
      generatedAt: new Date().toISOString(),
      summary,
      platforms,
      blockers: [],
      docsGuard: null,
    }
  }

  const placeholders = runs.map(() => '?').join(', ')
  const { results } = await db.prepare(`
    SELECT id, run_id, category, case_id, status, required_for_release, evidence_json, notes, created_at, updated_at
    FROM ${ITEMS_TABLE}
    WHERE run_id IN (${placeholders})
    ORDER BY updated_at DESC;
  `).bind(...runs.map(run => run.id)).all<ReleaseEvidenceItemRow>()

  const runById = new Map(runs.map(run => [run.id, run]))
  const latestEntries = new Map<string, ReleaseEvidenceMatrixEntry>()

  for (const row of results ?? []) {
    const run = runById.get(row.run_id)
    if (!run)
      continue
    const item = mapItem(row)
    const key = `${run.platform}:${run.scope}:${item.caseId}`
    if (!latestEntries.has(key)) {
      latestEntries.set(key, toMatrixEntry(run, item))
    }
  }

  const blockers: ReleaseEvidenceMatrixEntry[] = []
  let docsGuard: ReleaseEvidenceMatrixEntry | null = null

  for (const entry of latestEntries.values()) {
    const platformMatrix = platforms[entry.platform]
    platformMatrix.total += 1
    summary.total += 1

    if (entry.requiredForRelease) {
      platformMatrix.required += 1
      summary.required += 1
    }

    if (entry.status === 'passed') {
      platformMatrix.passed += 1
      summary.passed += 1
    }
    else if (entry.status === 'failed') {
      platformMatrix.failed += 1
      summary.failed += 1
    }
    else if (entry.status === 'blocked') {
      platformMatrix.blocked += 1
      summary.blocked += 1
    }
    else if (entry.status === 'pending') {
      platformMatrix.pending += 1
      summary.pending += 1
    }
    else if (entry.status === 'best_effort') {
      platformMatrix.bestEffort += 1
      summary.bestEffort += 1
    }
    else if (entry.status === 'skipped') {
      platformMatrix.skipped += 1
      summary.skipped += 1
    }

    if (isBlockingItem(entry)) {
      platformMatrix.blockingItems.push(entry)
      blockers.push(entry)
      summary.blocking += 1
    }

    if (
      entry.scope === 'docs'
      && entry.caseId === 'docs-guard'
      && (!docsGuard || entry.updatedAt > docsGuard.updatedAt)
    ) {
      docsGuard = entry
    }
  }

  for (const platform of RELEASE_EVIDENCE_PLATFORMS) {
    finalizePlatformMatrix(platforms[platform])
  }

  return {
    version: safeVersion,
    generatedAt: new Date().toISOString(),
    summary,
    platforms,
    blockers,
    docsGuard,
  }
}
