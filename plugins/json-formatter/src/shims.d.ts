declare interface Window {
  // extend the window
  MonacoEnvironment?: MonacoEnvironment
}

// with unplugin-vue-markdown, markdown files can be treated as Vue components
declare module '*.md' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, any>
  export default component
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

declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  class MonacoEditorWorker extends Worker {
    constructor()
  }

  export default MonacoEditorWorker
}

declare module 'monaco-editor/esm/vs/language/json/json.worker?worker' {
  class MonacoJsonWorker extends Worker {
    constructor()
  }

  export default MonacoJsonWorker
}

declare module 'monaco-editor/esm/vs/language/css/css.worker?worker' {
  class MonacoCssWorker extends Worker {
    constructor()
  }

  export default MonacoCssWorker
}

declare module 'monaco-editor/esm/vs/language/html/html.worker?worker' {
  class MonacoHtmlWorker extends Worker {
    constructor()
  }

  export default MonacoHtmlWorker
}

declare module 'monaco-editor/esm/vs/language/typescript/ts.worker?worker' {
  class MonacoTsWorker extends Worker {
    constructor()
  }

  export default MonacoTsWorker
}
