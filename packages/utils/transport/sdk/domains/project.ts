import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

export interface ProjectRecord {
  id: string
  rootPath: string
  name: string
  pinned: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export interface ProjectChangeNotification {
  type: 'upsert'
  projectId: string
  updatedAt: number
}

export const ProjectEvents = {
  list: defineEvent('project').module('api').event('list').define<void, ProjectRecord[]>(),
  selectDirectory: defineEvent('project')
    .module('api')
    .event('select-directory')
    .define<void, ProjectRecord | null>(),
  rename: defineEvent('project')
    .module('api')
    .event('rename')
    .define<{ id: string, name: string }, ProjectRecord>(),
  setPinned: defineEvent('project')
    .module('api')
    .event('set-pinned')
    .define<{ id: string, pinned: boolean }, ProjectRecord>(),
  setArchived: defineEvent('project')
    .module('api')
    .event('set-archived')
    .define<{ id: string, archived: boolean }, ProjectRecord>(),
  changed: defineEvent('project')
    .module('push')
    .event('changed')
    .define<ProjectChangeNotification, void>(),
} as const

export interface ProjectSdk {
  list: () => Promise<ProjectRecord[]>
  selectDirectory: () => Promise<ProjectRecord | null>
  rename: (id: string, name: string) => Promise<ProjectRecord>
  setPinned: (id: string, pinned: boolean) => Promise<ProjectRecord>
  setArchived: (id: string, archived: boolean) => Promise<ProjectRecord>
  onChanged: (listener: (notification: ProjectChangeNotification) => void) => () => void
}

export function createProjectSdk(transport: Pick<ITuffTransport, 'send' | 'on'>): ProjectSdk {
  return {
    list: () => transport.send(ProjectEvents.list),
    selectDirectory: () => transport.send(ProjectEvents.selectDirectory),
    rename: (id, name) => transport.send(ProjectEvents.rename, { id, name }),
    setPinned: (id, pinned) => transport.send(ProjectEvents.setPinned, { id, pinned }),
    setArchived: (id, archived) => transport.send(ProjectEvents.setArchived, { id, archived }),
    onChanged: listener => transport.on(ProjectEvents.changed, listener),
  }
}
