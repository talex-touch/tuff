import type { LogoutType } from '../enum'

export type IEventHandler = (...args: any[]) => void

export type EventName = 'REQUEST_TOGGLE_MODEL' | 'REQUEST_SHOW_HOTKEYS' | 'REQUEST_TOGGLE_SIDEBAR' | 'REQUEST_SAVE_CURRENT_CONVERSATION' | 'HOTKEY_SCOPE_CHANGE' | 'REQUEST_CREATE_NEW_CONVERSATION' | 'USER_LOGIN_SUCCESS' | 'USER_LOGOUT_SUCCESS'

// 声明EventBus type
export interface IEventBus {
  on: {
    (eventName: 'USER_LOGIN_SUCCESS', callback: () => void): void
    (eventName: 'USER_LOGOUT_SUCCESS', callback: (type: LogoutType) => void): void
    (eventName: 'REQUEST_CREATE_NEW_CONVERSATION', callback: () => void): void
    (eventName: 'HOTKEY_SCOPE_CHANGE', callback: (scope: string) => void): void
    (eventName: 'REQUEST_SAVE_CURRENT_CONVERSATION', callback: () => void): void
    (eventName: 'REQUEST_TOGGLE_SIDEBAR', callback: (visible?: boolean) => void): void
    (eventName: 'REQUEST_TOGGLE_MODEL', callback: () => void): void
    (eventName: 'REQUEST_SHOW_HOTKEYS', callback: () => void): void
  }

  emit: {
    (eventName: 'USER_LOGIN_SUCCESS'): void
    (eventName: 'USER_LOGOUT_SUCCESS', type: LogoutType): void
    (eventName: 'REQUEST_CREATE_NEW_CONVERSATION'): void
    (eventName: 'HOTKEY_SCOPE_CHANGE', scope: string): void
    (eventName: 'REQUEST_SAVE_CURRENT_CONVERSATION'): void
    (eventName: 'REQUEST_TOGGLE_SIDEBAR', visible?: boolean): void
    (eventName: 'REQUEST_TOGGLE_MODEL'): void
    (eventName: 'REQUEST_SHOW_HOTKEYS'): void
  }

  off: {
    (eventName: 'USER_LOGIN_SUCCESS', callback: () => void): void
    (eventName: 'USER_LOGOUT_SUCCESS', callback: (type: LogoutType) => void): void
    (eventName: 'REQUEST_CREATE_NEW_CONVERSATION', callback: () => void): void
    (eventName: 'HOTKEY_SCOPE_CHANGE', callback: (scope: string) => void): void
    (eventName: 'REQUEST_SHOW_HOTKEYS', callback: () => void): void
    (eventName: 'REQUEST_SAVE_CURRENT_CONVERSATION', callback: () => void): void
    (eventName: 'REQUEST_TOGGLE_SIDEBAR', callback: (visible?: boolean) => void): void
    (eventName: 'REQUEST_TOGGLE_MODEL', callback: () => void): void
  }
}

export class EventBus implements IEventBus {
  private eventMap: Map<EventName, IEventHandler[]> = new Map()

  on: IEventBus['on'] = (eventName: EventName, callback: IEventHandler) => {
    const handlers = this.eventMap.get(eventName) || []

    if (!handlers.includes(callback)) {
      handlers.push(callback)
      this.eventMap.set(eventName, handlers)
    }
  }

  emit: IEventBus['emit'] = (eventName: EventName, ...args: any) => {
    const handlers = this.eventMap.get(eventName)

    if (handlers)
      handlers.forEach(handler => handler(...args))
  }

  off: IEventBus['off'] = (eventName: EventName, callback: IEventHandler) => {
    const handlers = this.eventMap.get(eventName)

    if (handlers) {
      const index = handlers.indexOf(callback)

      if (index !== -1)
        handlers.splice(index, 1)

      this.eventMap.set(eventName, handlers)
    }
  }

  startScope() {
    const scopeHandlerMap: Map<EventName, IEventHandler[]> = new Map()

    const on: IEventBus['on'] = (eventName: EventName, callback: IEventHandler) => {
      const handlers = scopeHandlerMap.get(eventName) || []

      if (!handlers.includes(callback)) {
        handlers.push(callback)
        scopeHandlerMap.set(eventName, handlers)
      }

      this.on(eventName as any, callback)
    }

    const endScope = () => {
      scopeHandlerMap.forEach((handlers, eventName) => {
        handlers.forEach((handler) => {
          this.off(eventName as any, handler)
        })
      })

      scopeHandlerMap.clear()
    }

    return {
      on,
      // emit,
      endScope,
    }
  }
}

export const $event = new EventBus()
