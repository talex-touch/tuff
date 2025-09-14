import { app } from 'electron'
import {
  AfterAppStartEvent,
  BeforeAppStartEvent,
  TalexEvents,
  touchEventBus
} from './eventbus/touch-event'
import { TouchApp } from './touch-app'

let touchApp: TouchApp | null = null

export function genTouchApp(): TouchApp {
  if (!touchApp) {
    touchEventBus.emit(TalexEvents.BEFORE_APP_START, new BeforeAppStartEvent())
    touchApp = new TouchApp(app)
    touchEventBus.emit(TalexEvents.AFTER_APP_START, new AfterAppStartEvent())
  }
  return touchApp!
}
