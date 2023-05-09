
 declare namespace TalexTouch {
    export interface TouchApp {
     app: Electron.App;
     window: ITouchWindow;
    }
 
    export interface ITouchWindow {
        window: Electron.BrowserWindow;

        loadURL(url: string, options?: LoadURLOptions | undefined): Promise<Electron.WebContents>
        loadFile(filePath: string, options?: LoadFileOptions | undefined): Promise<Electron.WebContents>
    }

    export type LoadFileOptions = Electron.LoadFileOptions & { devtools?: boolean | "detach" | "left" | "right" | "bottom" | "undocked" }
    export type LoadURLOptions = Electron.LoadURLOptions & { devtools?: boolean | "detach" | "left" | "right" | "bottom" | "undocked" }
 }