import { OpenDevToolsOptions } from "electron";

export namespace TalexTouch {
  export interface TouchApp {
    app: Electron.App;
    window: ITouchWindow;
    version: AppVersion;
    moduleManager: IModuleManager;
    config: IConfiguration;
    rootPath: string;
  }

  export enum AppVersion {
    // ALPHA = "alpha",
    // BETA = "beta",
    DEV = "dev",
    RELEASE = "release",
  }

  export interface ITouchWindow {
    window: Electron.BrowserWindow;

    /**
     * Try to close the window. This has the same effect as a user manually clicking
     * the close button of the window. The web page may cancel the close though. See
     * the close event.
     */
    close(): void;

    /**
     * Minimizes the window. On some platforms the minimized window will be shown in
     * the Dock.
     */
    minimize(): void;

    /**
     * Opens the devtools.
     *
     * When `contents` is a `<webview>` tag, the `mode` would be `detach` by default,
     * explicitly passing an empty `mode` can force using last used dock state.
     *
     * On Windows, if Windows Control Overlay is enabled, Devtools will be opened with
     * `mode: 'detach'`.
     */
    openDevTools(options?: OpenDevToolsOptions): void;

    loadURL(
      url: string,
      options?: LoadURLOptions | undefined
    ): Promise<Electron.WebContents>;
    loadFile(
      filePath: string,
      options?: LoadFileOptions | undefined
    ): Promise<Electron.WebContents>;
  }

  export type LoadFileOptions = Electron.LoadFileOptions & {
    devtools?: boolean | "detach" | "left" | "right" | "bottom" | "undocked";
  };
  export type LoadURLOptions = Electron.LoadURLOptions & {
    devtools?: boolean | "detach" | "left" | "right" | "bottom" | "undocked";
  };

  export interface IModuleManager {
    /**
     * Module Loader
     * @param {TalexTouch.IModule} module
     * @description This function will load the module with the given name.
     * @returns {boolean} Returns true if the module is loaded successfully, otherwise returns false.
     */
    loadModule(module: IModule): boolean | Promise<boolean>;

    /**
     * Module Unloader
     * @param {string}
     * @description This function will unload the module with the given name.
     * @description This function will also call the module's destroy function.
     * @returns {boolean} Returns true if the module is unloaded successfully, otherwise returns false.
     */
    unloadModule(moduleName: Symbol): boolean | Promise<boolean>;

    /**
     * Module Getter
     * @param {string}
     * @description This function will return the module with the given name.
     * @description If the module is not loaded, this function will return undefined.
     */
    getModule(moduleName: Symbol): IModule | undefined;

    // TODO Next version preview
    // /**
    //  * Module register event listener
    //  */
    // registerEvent(moduleName: Symbol, eventName: string, callback: Function): void

    // /**
    //  * Module unregister event listener
    //  */
    // unregisterEvent(moduleName: Symbol, eventName: string, callback: Function): void

    // /**
    //  * Module emit event
    //  */
    // emitEvent(eventName: string, ...args: any[]): void
  }

  export interface IModule {
    /**
     * Module name
     * @type {string}
     * @description It's a unique name for each module, and it will be used to identify the module.
     * @description It's also the name of the module's folder, which will be automatically created by the manager.
     * @example "example-module"
     */
    name: Symbol;

    /**
     * Custom module file-path
     * @type {string}
     * @description If you want to load the module from a custom file-path, you can set this property.
     * @description If this property is not set, the manager will load the module from the default file-path. (.../modules/{module-name})
     */
    filePath?: string | boolean;

    /**
     * Module Initialization
     * @param {TalexTouch.TouchApp} app
     * @param {TalexTouch.IModuleManager} manager
     * @description This function will be called when the module is loaded.
     * @description You can use this function to initialize your module.
     * @description You can also use this function to register your module's event listeners.
     */
    init(
      app: TalexTouch.TouchApp,
      manager: TalexTouch.IModuleManager
    ): void;

    /**
     * Module Destruction
     * @param {TalexTouch.TouchApp} app
     * @param {TalexTouch.IModuleManager} manager
     * @description This function will be called when the module is unloaded.
     * @description You can use this function to destroy your module.
     * @description You can also use this function to unregister your module's event listeners.
     * @description This function will be called when the app is closed.
     */
    destroy(
      app: TalexTouch.TouchApp,
      manager: TalexTouch.IModuleManager
    ): void;
  }

  export interface IConfiguration { }
}