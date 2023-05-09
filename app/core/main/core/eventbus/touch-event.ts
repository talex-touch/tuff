import { EventHandlerWrapper, EventHandler, EventType, ITouchEvent, ITouchEventBus } from "utils/eventbus";
import { Event, NotificationResponse } from "electron";

export enum TalexEvents {
    BEFORE_APP_START = 'before-app-start',
    APP_START = 'app-start',
    AFTER_APP_START = 'after-app-start',
    APP_READY = 'app-ready',

    BEFORE_APP_QUIT = 'app-before-quit',

    APP_SECONDARY_LAUNCH = 'app-secondary-launch',
}

export class TouchEventHandlerWrapper implements EventHandlerWrapper {
    handler: EventHandler;
    type?: EventType = EventType.PERSIST;

    constructor(handler: EventHandler, type?: EventType) {
        this.handler = handler;
        this.type = type;
    }

}

export class TouchEventBus implements ITouchEventBus<TalexEvents> { 
    
    map: Map<TalexEvents, Set<TouchEventHandlerWrapper>> = new Map();

    emit<T extends ITouchEvent<TalexEvents>>(event: TalexEvents, data: T): void {
        const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>();

        ;[ ...handlers ].forEach(h => h.handler(data))

    }

    on(event: TalexEvents, handler: EventHandler): boolean {
        const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>();

        if ( [ ...handlers ].filter(h => h.handler === handler) ) return false
        
        handlers.add(new TouchEventHandlerWrapper(handler))
        
        this.map.set(event, handlers);
    }

    once(event: TalexEvents, handler: EventHandler): boolean {
        const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>();

        if ( [ ...handlers ].filter(h => h.handler === handler) ) return false
        
        handlers.add(new TouchEventHandlerWrapper(handler, EventType.CONSUME))
        
        this.map.set(event, handlers);
    }

    off(event: TalexEvents, handler: EventHandler): boolean {
        const handlers = this.map.get(event) || new Set<TouchEventHandlerWrapper>();

        const l = [ ...handlers ].filter(h => h.handler === handler)

        l.forEach(h => handlers.delete(h)) 

        return !!l.length
    }

    offAll(event: TalexEvents): boolean {
        return this.map.delete(event);
    }


}

export class BeforeAppStartEvent implements ITouchEvent<TalexEvents> {
    name: TalexEvents = TalexEvents.BEFORE_APP_START;
}

export class AfterAppStartEvent implements ITouchEvent<TalexEvents> {
    name: TalexEvents = TalexEvents.AFTER_APP_START;
}

export class AppStartEvent implements ITouchEvent<TalexEvents> {
    name: TalexEvents = TalexEvents.APP_START;
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
    name: TalexEvents = TalexEvents.APP_READY;

    /**
     * Electron's `Event` object
     */
    event: Event
    
    /**
     * Ready state & Launch info
     */
    launchInfo: (Record<string, any>) | (NotificationResponse)

    constructor(event: Event, launchInfo: (Record<string, any>) | (NotificationResponse)) {
        this.event = event;
        this.launchInfo = launchInfo;
    }
}

export class AppSecondaryLaunch implements ITouchEvent<TalexEvents> {
    name: TalexEvents = TalexEvents.APP_SECONDARY_LAUNCH;

    /**
     * Electron's `Event` object
     */
    event: Event

    /**
     * The command line arguments passed when the second instance was executed.
     * An array of the second instance's command line arguments, starting with the executable path.
     */
    argv: string[];

    /**
     * Working directory
     */
    cwd: string;

    /**
     * A JSON object of additional data passed from the second instance.
     */
    data: any;

    constructor(event: Event, argv: string[], cwd: string, data: any) {
        this.event = event;
        this.argv = argv;
        this.cwd = cwd;
        this.data = data;
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
    name: TalexEvents = TalexEvents.BEFORE_APP_QUIT;

    /**
     * Electron's `Event` object
     */
    event: Event

    constructor(event: Event) {
        this.event = event;
    }
}

export const touchEventBus = new TouchEventBus();