import type { PromptTemplate } from '~/modules/intelligence/prompt-types'
import {
  createStorageDataProxy,
  createStorageProxy,
  TouchStorage
} from '@talex-touch/utils/renderer/storage/base-storage'

export interface PromptLibraryData {
  version: number
  customPrompts: PromptTemplate[]
}

const PROMPT_LIBRARY_STORAGE_KEY = 'intelligence/prompt-library'
const PROMPT_LIBRARY_SINGLETON_KEY = `storage:${PROMPT_LIBRARY_STORAGE_KEY}`

const defaultPromptLibrary: PromptLibraryData = {
  version: 1,
  customPrompts: []
}

function clonePrompts(prompts: PromptTemplate[]): PromptTemplate[] {
  return prompts.map((prompt) => ({ ...prompt }))
}

class PromptLibraryStorage extends TouchStorage<PromptLibraryData> {
  constructor() {
    super(PROMPT_LIBRARY_STORAGE_KEY, {
      version: defaultPromptLibrary.version,
      customPrompts: clonePrompts(defaultPromptLibrary.customPrompts)
    })
    this.setAutoSave(true)
  }

  replaceCustomPrompts(next: PromptTemplate[]): void {
    this.data.customPrompts.splice(0, this.data.customPrompts.length, ...clonePrompts(next))
  }

  getCustomPrompts(): PromptTemplate[] {
    return this.data.customPrompts
  }
}

export const promptLibraryStorage = createStorageProxy(
  PROMPT_LIBRARY_SINGLETON_KEY,
  () => new PromptLibraryStorage()
)

export const promptLibraryData = createStorageDataProxy(promptLibraryStorage)
