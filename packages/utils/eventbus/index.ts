export type EventHandler = (event: ITouchEvent) => void;

export interface EventHandlerWrapper {
  /**
   * Event handler
   */
  handler: EventHandler;

  /**
   * Event type
   * @see EventType
   * @default EventType.PERSIST (must be, if implements)
   */
  type?: EventType;
}

export enum EventType {
  PERSIST,
  CONSUME,
}

export interface ITouchEvent<E = any> {
  /**
   * Event name
   */
  name: E;

  /**
   * Event data
   */
  data?: any;
}

export interface ITouchEventBus<E> {
  map: Map<E, Set<EventHandlerWrapper>>;

  /**
   * Subscribe touch-app events (any kind of events extends from TouchEvent)
   * @param event EventName (extends from TouchEvent)
   * @param handler Event handler (extends from EventHandler)
   * @returns true if the event was added, otherwise false
   */
  on(event: E, handler: EventHandler): boolean | void;

  /**
   * Subscribe touch-app events (any kind of events extends from TouchEvent)
   * @param event EventName (extends from TouchEvent)
   * @param handler Event handler (extends from EventHandler)
   * @returns true if the event was added, otherwise false
   */
  once(event: E, handler: EventHandler): boolean | void;

  /**
   * UnSubscribe touch-app events (any kind of events extends from TouchEvent)
   * @param event EventName (extends from TouchEvent)
   * @param handler Event handler (extends from EventHandler)
   * @returns true if the event was removed, otherwise false
   * @example
   * ```ts
   * const handler = (event: TouchEvent) => {
   *    console.log(event)
   * }
   */
  off(event: E, handler: EventHandler): boolean;

  /**
   * UnSubscribe touch-app events all matched (any kind of events extends from TouchEvent)
   * @param event EventName (extends from TouchEvent)
   * @returns true if the event was added, otherwise false
   */
  offAll(event: E): boolean;

  /**
   * UnSubscribe touch-app events all matched (any kind of events extends from TouchEvent)
   * @param event EventName (extends from TouchEvent)
   * @returns true if the event was added, otherwise false
   */
  offAll(event: E): boolean;

  /**
   * Emit touch-app events (any kind of events extends from TouchEvent)
   * @param event EventName (extends from TouchEvent)
   * @param data Event data (extends from TouchEvent)
   */
  emit<T extends ITouchEvent<E>>(event: E, data: T): void;
}
