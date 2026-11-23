declare interface Window {
  // extend the window
  MonacoEnvironment?: MonacoEnvironment
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_MONACO_VS_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface MonacoEnvironment {
  getWorker: (moduleId: string, label: string) => Worker
}

declare module 'monaco-editor/editor/editor.worker?worker' {
  class MonacoEditorWorker extends Worker {
    constructor()
  }

  export default MonacoEditorWorker
}

declare module 'monaco-editor/languages/features/json/json.worker?worker' {
  class MonacoJsonWorker extends Worker {
    constructor()
  }

  export default MonacoJsonWorker
}

declare module 'monaco-editor/editor/browser/*'
declare module 'monaco-editor/editor/contrib/*'
declare module 'monaco-editor/languages/definitions/*'
declare module 'monaco-editor/base/*'
