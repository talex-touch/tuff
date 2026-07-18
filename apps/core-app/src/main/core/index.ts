import { app } from 'electron'
import {
  AfterAppStartEvent,
  BeforeAppStartEvent,
  TalexEvents,
  touchEventBus
} from './eventbus/touch-event'
import { setCurrentTouchApp } from './main-runtime-state'
import { TouchApp } from './touch-app'

let touchApp: TouchApp | null = null

export function genTouchApp(startupAppSettings: Record<string, unknown> = {}): TouchApp {
  if (!touchApp) {
    touchEventBus.emit(TalexEvents.BEFORE_APP_START, new BeforeAppStartEvent())
    touchApp = new TouchApp(app, startupAppSettings)
    setCurrentTouchApp(touchApp)
    touchEventBus.emit(TalexEvents.AFTER_APP_START, new AfterAppStartEvent())
  }
  return touchApp!
}
