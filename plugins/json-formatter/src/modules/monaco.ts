import type { UserModule } from '~/types'
import loader from '@monaco-editor/loader'

type MonacoNamespace = typeof import('monaco-editor')
type MonacoWorkerCtor = new () => Worker

async function configureMonaco() {
  const [
    monacoModule,
    editorWorkerModule,
    jsonWorkerModule,
    cssWorkerModule,
    htmlWorkerModule,
    tsWorkerModule,
  ] = await Promise.all([
    import('monaco-editor'),
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/json/json.worker?worker'),
    import('monaco-editor/esm/vs/language/css/css.worker?worker'),
    import('monaco-editor/esm/vs/language/html/html.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  ])

  const monaco = monacoModule as MonacoNamespace
  const EditorWorker = editorWorkerModule.default as MonacoWorkerCtor
  const JsonWorker = jsonWorkerModule.default as MonacoWorkerCtor
  const CssWorker = cssWorkerModule.default as MonacoWorkerCtor
  const HtmlWorker = htmlWorkerModule.default as MonacoWorkerCtor
  const TsWorker = tsWorkerModule.default as MonacoWorkerCtor

  const globalSelf = globalThis as typeof globalThis & {
    MonacoEnvironment?: MonacoEnvironment
  }

  globalSelf.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === 'json')
        return new JsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less')
        return new CssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor')
        return new HtmlWorker()
      if (label === 'typescript' || label === 'javascript')
        return new TsWorker()
      return new EditorWorker()
    },
  }

  loader.config({ monaco })
}

const monacoReady = configureMonaco()

export function waitForMonacoReady() {
  return monacoReady
}

export const install: UserModule = () => {
  void monacoReady
}
