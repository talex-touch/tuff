import type { PromptTemplate } from '~/modules/intelligence/prompt-types'
import { reactive } from 'vue'
import { getBuiltinPromptTemplates } from '~/modules/intelligence/builtin-prompts'
import { promptLibraryStorage } from '~/modules/storage/prompt-library'

export function usePromptManager() {
  const prompts = reactive({
    builtin: getBuiltinPromptTemplates(),
    custom: promptLibraryStorage.getCustomPrompts()
  })

  const persistCustomPrompts = (): void => {
    saveCustomPrompts().catch((error) => {
      console.error('Failed to persist custom prompts:', error)
    })
  }

  const refreshCustomPrompts = (next?: PromptTemplate[]): void => {
    if (next) {
      promptLibraryStorage.replaceCustomPrompts(next)
    }
    prompts.custom = promptLibraryStorage.getCustomPrompts()
  }

  // 获取所有提示词
  const getAllPrompts = () => {
    return [...prompts.builtin, ...prompts.custom]
  }

  // 根据ID获取提示词
  const getPromptById = (id: string): PromptTemplate | undefined => {
    return getAllPrompts().find((prompt) => prompt.id === id)
  }

  // 根据类别获取提示词
  const getPromptsByCategory = (category: string): PromptTemplate[] => {
    return getAllPrompts().filter((prompt) => prompt.category === category)
  }

  // 搜索提示词
  const searchPrompts = (query: string): PromptTemplate[] => {
    const lowerQuery = query.toLowerCase()
    return getAllPrompts().filter(
      (prompt) =>
        prompt.name.toLowerCase().includes(lowerQuery) ||
        prompt.content.toLowerCase().includes(lowerQuery) ||
        (prompt.description && prompt.description.toLowerCase().includes(lowerQuery))
    )
  }

  // 添加自定义提示词
  const addCustomPrompt = (
    prompt: Omit<PromptTemplate, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>
  ): string => {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newPrompt: PromptTemplate = {
      ...prompt,
      id,
      builtin: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    prompts.custom.push(newPrompt)
    persistCustomPrompts()

    return id
  }

  // 更新自定义提示词
  const updateCustomPrompt = (id: string, updates: Partial<PromptTemplate>): boolean => {
    const index = prompts.custom.findIndex((prompt) => prompt.id === id && !prompt.builtin)
    if (index === -1) return false

    const updated = {
      ...prompts.custom[index],
      ...updates,
      id, // 确保ID不被修改
      builtin: false, // 确保builtin标志不被修改
      updatedAt: Date.now()
    }

    prompts.custom[index] = updated
    persistCustomPrompts()

    return true
  }

  // 删除自定义提示词
  const deleteCustomPrompt = (id: string): boolean => {
    const index = prompts.custom.findIndex((prompt) => prompt.id === id && !prompt.builtin)
    if (index === -1) return false

    prompts.custom.splice(index, 1)
    persistCustomPrompts()

    return true
  }

  // 保存自定义提示词到存储
  const saveCustomPrompts = async () => {
    try {
      promptLibraryStorage.replaceCustomPrompts(prompts.custom)
      await promptLibraryStorage.saveToRemote({ force: true })
    } catch (error) {
      console.error('Failed to save custom prompts:', error)
    }
  }

  // 从存储加载自定义提示词
  const loadCustomPrompts = async () => {
    try {
      await promptLibraryStorage.reloadFromRemote()
      refreshCustomPrompts()
    } catch (error) {
      console.error('Failed to load custom prompts:', error)
    }
  }

  // 导入提示词
  const importPrompts = (promptsToImport: PromptTemplate[]): number => {
    let imported = 0
    promptsToImport.forEach((prompt) => {
      if (!prompt.builtin && !getPromptById(prompt.id)) {
        const newPrompt: PromptTemplate = {
          ...prompt,
          id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          builtin: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        prompts.custom.push(newPrompt)
        imported++
      }
    })

    if (imported > 0) {
      persistCustomPrompts()
    }

    return imported
  }

  // 导出自定义提示词
  const exportCustomPrompts = (): PromptTemplate[] => {
    return prompts.custom.map((prompt) => ({ ...prompt }))
  }

  return {
    prompts,
    getAllPrompts,
    getPromptById,
    getPromptsByCategory,
    searchPrompts,
    addCustomPrompt,
    updateCustomPrompt,
    deleteCustomPrompt,
    saveCustomPrompts,
    loadCustomPrompts,
    importPrompts,
    exportCustomPrompts
  }
}

// 单例模式，确保全局状态一致性
let promptManagerInstance: ReturnType<typeof usePromptManager> | null = null

export function getPromptManager() {
  if (!promptManagerInstance) {
    promptManagerInstance = usePromptManager()
  }
  return promptManagerInstance
}
