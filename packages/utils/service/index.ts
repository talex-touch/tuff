export interface IService {
  /**
   * service id
   */
  id: symbol;

  /**
   * service name
   */
  name: string;

  /**
   * service description
   */
  description: string;
}

export interface IServiceEvent {

  service: IService;

  setCancelled(cancelled: boolean): void;

  isCancelled(): boolean;
}

export interface IServiceHandler {
  /**
   * The plugin scope of the service handler
   * @description
   * When service registered, the service center will use the plugin scope to find the service handler.
   * If plugin is disabled, the app will automatically enable plugin and hand on the service to the plugin.
   * When plugin enabled, you must immediately register service handler to the service center, app will waiting for the service handler, until the service handler handled.
   */
  pluginScope: string

  /**
   * Handle the service data
   * @param data service data
   */
  handle(event: IServiceEvent, data: object);
}

export interface IServiceCenter {
  /**
   * The service center will register the service
   * @param service will be registered service
   * @param handler service handler
   * @returns register result (true: success, false: fail)
   */
  regService(service: IService, handler: IServiceHandler): boolean;

  /**
   * The service center will unregister the service
   * @param service will be unregistered service
   * @returns unregister result (true: success, false: fail)
   */
  unRegService(service: IService): boolean;

  /**
   * Get the service by service id
   * @param id service id
   * @returns service
   */
  // getService(id: symbol): IService;

  useService(service: IService, data: object): Promise<boolean> | boolean;
}