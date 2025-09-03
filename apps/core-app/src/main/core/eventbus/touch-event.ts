import {
  EventHandlerWrapper,
  EventHandler,
  EventType,
  ITouchEvent,
  ITouchEventBus
} from '@talex-touch/utils/eventbus'
import { Event, NotificationResponse } from 'electron'

export enum TalexEvents {
  BEFORE_APP_START = 'before-app-start',
  APP_START = 'app-start',
  AFTER_APP_START = 'after-app-start',
  APP_READY = 'app-ready',

  ALL_MODULES_LOADED = 'all-modules-loaded',

  BEFORE_APP_QUIT = 'app-before-quit',
  WILL_QUIT = 'will-quit',
  WINDOW_ALL_CLOSED = 'window-all-closed',

  APP_SECONDARY_LAUNCH = 'app-secondary-launch',
  OPEN_EXTERNAL_URL = 'open-external-url',

  // File System Events
  FILE_ADDED = 'file-system/file-added',
  FILE_CHANGED = 'file-system/file-changed',
  FILE_UNLINKED = 'file-system/file-unlinked',
  DIRECTORY_ADDED = 'file-system/directory-added',
  DIRECTORY_UNLINKED = 'file-system/directory-unlinked',

  // Plugin Log Event
  PLUGIN_LOG_APPEND = 'plugin/log-append',

  // Plugin Storage Event
  PLUGIN_STORAGE_UPDATED = 'plugin/storage-updated',

  // Clipboard Events
  CLIPBOARD_CHANGE = 'clipboard/change'
}

import { LogItem } from '@talex-touch/utils/plugin/log/types'

export class TouchEventHandlerWrapper implements EventHandlerWrapper {
  handler: EventHandler
  type?: EventType = EventType.PERSIST

  constructor(handler: EventHandler, type?: EventType) {
    this.handler = handler
    this.type = type
  }
}

export class TouchEventBus implements ITouchEventBus<TalexEvents> {
  map: Map<TalexEvents, Set<TouchEventHandlerWrapper>> = new Map()

  emit<T extends ITouchEvent<TalexEvents>>(event: TalexEvents, data: T): void {
    const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>()

    ;[...handlers].forEach((h) => h.handler(data))
  }

  on(event: TalexEvents, handler: EventHandler): boolean | void {
    const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>()

    if ([...handlers].filter((h) => h.handler === handler).length)
      throw new Error('EventHandler already exists (Repeat on)')

    handlers.add(new TouchEventHandlerWrapper(handler))

    this.map.set(event, handlers)
  }

  once(event: TalexEvents, handler: EventHandler): boolean | void {
    const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>()

    if ([...handlers].filter((h) => h.handler === handler).length)
      throw new Error('EventHandler already exists (Repeat once)')

    handlers.add(new TouchEventHandlerWrapper(handler, EventType.CONSUME))

    this.map.set(event, handlers)
  }

  off(event: TalexEvents, handler: EventHandler): boolean {
    const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>()

    const l = [...handlers].filter((h) => h.handler === handler)

    l.forEach((h) => handlers.delete(h))

    return !!l.length
  }

  offAll(event: TalexEvents): boolean {
    return this.map.delete(event)
  }
}

export class BeforeAppStartEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.BEFORE_APP_START
}

export class AfterAppStartEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.AFTER_APP_START
}

export class AppStartEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.APP_START
}

export class AppReadyEvent implements ITouchEvent<TalexEvents> {
  /**
   * Emitted once, when Electron has finished initializing. On macOS, `launchInfo`
   * holds the `userInfo` of the `NSUserNotification` or information from
   * `UNNotificationResponse` that was used to open the application, if it was
   * launched from Notification Center. You can also call `app.isReady()` to check if
   * this event has already fired and `app.whenReady()` to get a Promise that is
   * fulfilled when Electron is initialized.
   */
  name: TalexEvents = TalexEvents.APP_READY

  /**
   * Electron's `Event` object
   */
  event: Event

  /**
   * Ready state & Launch info
   */
  launchInfo: Record<string, any> | NotificationResponse

  constructor(event: Event, launchInfo: Record<string, any> | NotificationResponse) {
    this.event = event
    this.launchInfo = launchInfo
  }
}

export class AllModulesLoadedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.ALL_MODULES_LOADED
}

export class AppSecondaryLaunch implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.APP_SECONDARY_LAUNCH

  /**
   * Electron's `Event` object
   */
  event: Event

  /**
   * The command line arguments passed when the second instance was executed.
   * An array of the second instance's command line arguments, starting with the executable path.
   */
  argv: string[]

  /**
   * Working directory
   */
  cwd: string

  /**
   * A JSON object of additional data passed from the second instance.
   */
  data: any

  constructor(event: Event, argv: string[], cwd: string, data: any) {
    this.event = event
    this.argv = argv
    this.cwd = cwd
    this.data = data

    console.log('AppSecondaryLaunch', this)
  }
}

export class BeforeAppQuitEvent implements ITouchEvent<TalexEvents> {
  /**
   * Emitted before the application starts closing its windows. Calling
   * `event.preventDefault()` will prevent the default behavior, which is terminating
   * the application.
   *
   * **Note:** If application quit was initiated by `autoUpdater.quitAndInstall()`,
   * then `before-quit` is emitted *after* emitting `close` event on all windows and
   * closing them.
   *
   * **Note:** On Windows, this event will not be emitted if the app is closed due to
   * a shutdown/restart of the system or a user logout.
   */
  name: TalexEvents = TalexEvents.BEFORE_APP_QUIT

  /**
   * Electron's `Event` object
   */
  event: Event

  constructor(event: Event) {
    this.event = event
  }
}

export class AppQuitEvent implements ITouchEvent<TalexEvents> {
  /**
   * Emitted when all windows have been closed and the application will quit. Calling
   * `event.preventDefault()` will prevent the default behavior, which is terminating
   * the application.
   *
   * See the description of the `window-all-closed` event for the differences between
   * the `will-quit` and `window-all-closed` events.
   *
   * **Note:** On Windows, this event will not be emitted if the app is closed due to
   * a shutdown/restart of the system or a user logout.
   */
  name: TalexEvents = TalexEvents.WILL_QUIT

  /**
   * Electron's `Event` object
   */
  event: Event

  constructor(event: Event) {
    this.event = event
  }
}

export class WindowAllClosedEvent implements ITouchEvent<TalexEvents> {
  /**
   * Emitted when all windows have been closed.
   *
   * If you do not subscribe to this event and all windows are closed, the default
   * behavior is to quit the app; however, if you subscribe, you control whether the
   * app quits or not. If the user pressed `Cmd + Q`, or the developer called
   * `app.quit()`, Electron will first try to close all the windows and then emit the
   * `will-quit` event, and in this case the `window-all-closed` event would not be
   * emitted.
   */
  name: TalexEvents = TalexEvents.WILL_QUIT

  constructor() {}
}

export class OpenExternalUrlEvent implements ITouchEvent<TalexEvents> {
  /**
   * Called before creating a window a new window is requested by the renderer, e.g.
   * by `window.open()`, a link with `target="_blank"`, shift+clicking on a link, or
   * submitting a form with `<form target="_blank">`. See `window.open()` for more
   * details and how to use this in conjunction with `did-create-window`.
   */
  name: TalexEvents = TalexEvents.OPEN_EXTERNAL_URL

  data: string

  constructor(details: string) {
    this.data = details
  }
}

// File System Event Classes
export class FileAddedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.FILE_ADDED
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }
}

export class FileChangedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.FILE_CHANGED
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }
}

export class FileUnlinkedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.FILE_UNLINKED
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }
}

export class DirectoryAddedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.DIRECTORY_ADDED
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }
}

export class DirectoryUnlinkedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.DIRECTORY_UNLINKED
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }
}

export class PluginLogAppendEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.PLUGIN_LOG_APPEND
  log: LogItem

  constructor(log: LogItem) {
    this.log = log
  }
}

export class PluginStorageUpdatedEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.PLUGIN_STORAGE_UPDATED
  pluginName: string

  constructor(pluginName: string) {
    this.pluginName = pluginName
  }
}

export class ClipboardChangeEvent implements ITouchEvent<TalexEvents> {
  name: TalexEvents = TalexEvents.CLIPBOARD_CHANGE
  payload: any

  constructor(payload: any) {
    this.payload = payload
  }
}

export const touchEventBus = new TouchEventBus()
