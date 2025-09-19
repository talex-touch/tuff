import { BrowserWindowConstructorOptions, OpenDevToolsOptions } from "electron";
import { IBaseModuleManager, IBaseModule } from './modules'

export namespace TalexTouch {
  export interface TouchApp {
    app: Electron.App;
    window: ITouchWindow;
    version: AppVersion;
    moduleManager: IBaseModuleManager;
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
      options?: LoadURLOptions | undefined,
    ): Promise<Electron.WebContents>;
    loadFile(
      filePath: string,
      options?: LoadFileOptions | undefined,
    ): Promise<Electron.WebContents>;
  }

  export type TouchWindowConstructorOptions =
    BrowserWindowConstructorOptions & {
      autoShow?: boolean;
    };

  export type LoadFileOptions = Electron.LoadFileOptions & {
    devtools?: boolean | "detach" | "left" | "right" | "bottom" | "undocked";
  };
  export type LoadURLOptions = Electron.LoadURLOptions & {
    devtools?: boolean | "detach" | "left" | "right" | "bottom" | "undocked";
  };

  export interface IModuleManager<E> extends IBaseModuleManager<E> {

  }

  export interface IModule<E> extends IBaseModule<E> {}

  export interface IConfiguration {
    configPath: string;
    data: TouchAppConfig;
    triggerSave: Function;
  }

  export interface TouchAppConfig {
    frame: {
      width: number;
      height: number;
      left?: number;
      top?: number;
    };
  }
}
