import type { UserModule } from '~/types'
import loader from '@monaco-editor/loader'

type MonacoWorkerCtor = new () => Worker

async function configureMonaco() {
  const [
    monacoApi,
    jsonFeature,
    editorWorkerModule,
    jsonWorkerModule,
  ] = await Promise.all([
    import('monaco-editor/editor/editor.api'),
    import('monaco-editor/languages/features/json/register'),
    import('monaco-editor/editor/editor.worker?worker'),
    import('monaco-editor/languages/features/json/json.worker?worker'),
    import('monaco-editor/languages/definitions/yaml/register'),
    import('monaco-editor/languages/definitions/xml/register'),
    import('monaco-editor/editor/browser/coreCommands'),
    import('monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'),
    import('monaco-editor/editor/contrib/clipboard/browser/clipboard'),
    import('monaco-editor/editor/contrib/contextmenu/browser/contextmenu'),
    import('monaco-editor/editor/contrib/find/browser/findController'),
    import('monaco-editor/editor/contrib/folding/browser/folding'),
    import('monaco-editor/editor/contrib/format/browser/formatActions'),
    import('monaco-editor/editor/contrib/hover/browser/hoverContribution'),
    import('monaco-editor/editor/contrib/indentation/browser/indentation'),
    import('monaco-editor/editor/contrib/lineSelection/browser/lineSelection'),
    import('monaco-editor/editor/contrib/linesOperations/browser/linesOperations'),
    import('monaco-editor/editor/contrib/multicursor/browser/multicursor'),
    import('monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter'),
    import('monaco-editor/editor/contrib/wordOperations/browser/wordOperations'),
  ])

  const EditorWorker = editorWorkerModule.default as MonacoWorkerCtor
  const JsonWorker = jsonWorkerModule.default as MonacoWorkerCtor

  const globalSelf = globalThis as typeof globalThis & {
    MonacoEnvironment?: MonacoEnvironment
  }

  globalSelf.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === 'json')
        return new JsonWorker()
      return new EditorWorker()
    },
  }

  // Keep JSON validation strictly offline so Monaco never requests remote $schema URLs.
  jsonFeature.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    enableSchemaRequest: false,
  })

  loader.config({ monaco: monacoApi as any })
}

const monacoReady = configureMonaco()

export function waitForMonacoReady() {
  return monacoReady
}

export const install: UserModule = () => {
  void monacoReady
}
