import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { getLogger } from '@talex-touch/utils/common/logger'
import { ProjectEvents } from '@talex-touch/utils/transport/sdk/domains/project'
import { BrowserWindow, dialog } from 'electron'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import {
  createOrRestoreProject,
  listProjects,
  renameProject,
  setProjectArchived,
  setProjectPinned,
  subscribeProjectMutations
} from './project-store'

export * from './project-store'

const projectLog = getLogger('project')

function assertHostOwned(context: HandlerContext): Electron.WebContents {
  if (context.plugin || !context.sender || context.sender.isDestroyed()) {
    throw new Error('PROJECT_HOST_ONLY')
  }
  return context.sender
}

function requireProjectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z0-9-]{1,128}$/i.test(value)) {
    throw new Error('PROJECT_ID_INVALID')
  }
  return value
}

export class ProjectModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('Project')

  private disposers: Array<() => void> = []

  constructor() {
    super(ProjectModule.key, { create: false })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'ProjectModule.onInit')
    const transport = runtime.transport

    this.disposers.push(
      subscribeProjectMutations((mutation) => {
        transport.broadcast(ProjectEvents.changed, mutation)
      }),
      transport.on(ProjectEvents.list, async (_payload, context) => {
        assertHostOwned(context)
        return await listProjects()
      }),
      transport.on(ProjectEvents.selectDirectory, async (_payload, context) => {
        const sender = assertHostOwned(context)
        const parent = BrowserWindow.fromWebContents(sender)
        if (!parent || parent.isDestroyed()) throw new Error('PROJECT_WINDOW_INVALID')
        const result = await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
        if (result.canceled) return null
        if (result.filePaths.length !== 1) throw new Error('PROJECT_PATH_INVALID')
        return await createOrRestoreProject(result.filePaths[0]!)
      }),
      transport.on(ProjectEvents.rename, async (payload, context) => {
        assertHostOwned(context)
        return await renameProject(requireProjectId(payload?.id), payload?.name)
      }),
      transport.on(ProjectEvents.setPinned, async (payload, context) => {
        assertHostOwned(context)
        if (typeof payload?.pinned !== 'boolean') throw new Error('PROJECT_PIN_INVALID')
        return await setProjectPinned(requireProjectId(payload.id), payload.pinned)
      }),
      transport.on(ProjectEvents.setArchived, async (payload, context) => {
        assertHostOwned(context)
        if (typeof payload?.archived !== 'boolean') throw new Error('PROJECT_ARCHIVE_INVALID')
        return await setProjectArchived(requireProjectId(payload.id), payload.archived)
      })
    )

    projectLog.info('Project channels registered')
  }

  onDestroy(): MaybePromise<void> {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }
}

export const projectModule = new ProjectModule()
