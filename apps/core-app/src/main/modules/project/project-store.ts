import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { asc, desc, eq } from 'drizzle-orm'
import { scheduleDbWrite } from '../../db/db-write'
import { projects } from '../../db/schema'
import { databaseModule } from '../database'

export interface StoredProject {
  id: string
  rootPath: string
  name: string
  pinned: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export interface ProjectMutation {
  type: 'upsert'
  projectId: string
  updatedAt: number
}

const mutationListeners = new Set<(mutation: ProjectMutation) => void>()

export function subscribeProjectMutations(
  listener: (mutation: ProjectMutation) => void
): () => void {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}

function projectError(
  code: 'PROJECT_PATH_INVALID' | 'PROJECT_NAME_INVALID' | 'PROJECT_NOT_FOUND'
): Error {
  return new Error(code)
}

function normalizeProjectName(value: unknown): string {
  if (typeof value !== 'string') throw projectError('PROJECT_NAME_INVALID')
  const name = value.trim()
  const length = Array.from(name).length
  if (length < 1 || length > 80) throw projectError('PROJECT_NAME_INVALID')
  return name
}

async function canonicalProjectRoot(rootPath: string): Promise<string> {
  if (typeof rootPath !== 'string' || !rootPath.trim()) throw projectError('PROJECT_PATH_INVALID')
  try {
    const canonicalRoot = await realpath(rootPath)
    const details = await stat(canonicalRoot)
    if (!details.isDirectory()) throw projectError('PROJECT_PATH_INVALID')
    return canonicalRoot
  } catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_PATH_INVALID') throw error
    throw projectError('PROJECT_PATH_INVALID')
  }
}

function initialProjectName(canonicalRoot: string): string {
  return basename(canonicalRoot) || canonicalRoot
}

function publishUpdatedProject(rows: StoredProject[]): StoredProject {
  const project = rows[0]
  if (!project) throw projectError('PROJECT_NOT_FOUND')
  const mutation: ProjectMutation = {
    type: 'upsert',
    projectId: project.id,
    updatedAt: project.updatedAt
  }
  for (const listener of mutationListeners) listener(mutation)
  return project
}

export async function listProjects(): Promise<StoredProject[]> {
  return await databaseModule
    .getDb()
    .select()
    .from(projects)
    .orderBy(asc(projects.archived), desc(projects.pinned), desc(projects.lastOpenedAt))
}

export async function getProject(id: string): Promise<StoredProject | null> {
  const [project] = await databaseModule.getDb().select().from(projects).where(eq(projects.id, id))
  return project ?? null
}

export async function createOrRestoreProject(rootPath: string): Promise<StoredProject> {
  const canonicalRoot = await canonicalProjectRoot(rootPath)
  const now = Date.now()
  const db = databaseModule.getDb()
  const rows = await scheduleDbWrite('project.create-or-restore', () =>
    db
      .insert(projects)
      .values({
        id: randomUUID(),
        rootPath: canonicalRoot,
        name: initialProjectName(canonicalRoot),
        pinned: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now
      })
      .onConflictDoUpdate({
        target: projects.rootPath,
        set: { archived: false, updatedAt: now, lastOpenedAt: now }
      })
      .returning()
  )
  return publishUpdatedProject(rows)
}

export async function renameProject(id: string, value: string): Promise<StoredProject> {
  const name = normalizeProjectName(value)
  const now = Date.now()
  const db = databaseModule.getDb()
  const rows = await scheduleDbWrite('project.rename', () =>
    db.update(projects).set({ name, updatedAt: now }).where(eq(projects.id, id)).returning()
  )
  return publishUpdatedProject(rows)
}

export async function setProjectPinned(id: string, pinned: boolean): Promise<StoredProject> {
  const now = Date.now()
  const db = databaseModule.getDb()
  const rows = await scheduleDbWrite('project.set-pinned', () =>
    db
      .update(projects)
      .set({ pinned: pinned === true, updatedAt: now })
      .where(eq(projects.id, id))
      .returning()
  )
  return publishUpdatedProject(rows)
}

export async function setProjectArchived(id: string, archived: boolean): Promise<StoredProject> {
  const now = Date.now()
  const db = databaseModule.getDb()
  const rows = await scheduleDbWrite('project.set-archived', () =>
    db
      .update(projects)
      .set({ archived: archived === true, updatedAt: now })
      .where(eq(projects.id, id))
      .returning()
  )
  return publishUpdatedProject(rows)
}

export async function touchProject(id: string): Promise<StoredProject> {
  const now = Date.now()
  const db = databaseModule.getDb()
  const rows = await scheduleDbWrite('project.touch', () =>
    db
      .update(projects)
      .set({ updatedAt: now, lastOpenedAt: now })
      .where(eq(projects.id, id))
      .returning()
  )
  return publishUpdatedProject(rows)
}
