import { reactive } from 'vue'
import type { PromptTemplate } from '~/modules/intelligence/prompt-types'
import { promptLibraryStorage } from '~/modules/storage/prompt-library'

// Mock data - 实际应该从存储系统或API获取
const builtinPrompts: PromptTemplate[] = [
  {
    id: 'assistant_default',
    name: '通用助手',
    content: '你是一个有用的AI助手，请友好、准确地回答用户的问题。',
    builtin: true,
    category: 'general',
    description: '适用于日常对话和通用问题解答',
  },
  {
    id: 'ocr_assistant',
    name: 'OCR助手',
    content: '你是一名OCR助手，返回JSON，包含text/keywords/blocks等字段。请准确识别图片中的文字内容。',
    builtin: true,
    category: 'image',
    description: '专门用于图片文字识别和结构化输出',
  },
  {
    id: 'translation_assistant',
    name: '翻译助手',
    content: '你是一名专业的翻译助手，请准确翻译用户提供的文本，保持原意和语言风格。',
    builtin: true,
    category: 'language',
    description: '专业翻译服务，支持多语言转换',
  },
  {
    id: 'code_assistant',
    name: '编程助手',
    content: '你是一名专业的编程助手，请提供准确、清晰的代码解答和编程建议。',
    builtin: true,
    category: 'development',
    description: '编程相关问题解答和代码生成',
  },
  {
    id: 'data_analyst',
    name: '数据分析师',
    content: '你是一名专业的数据分析师，擅长数据处理、分析和可视化建议。请用专业的角度分析数据并提供见解。',
    builtin: true,
    category: 'analysis',
    description: '数据分析和业务洞察',
  },
  {
    id: 'creative_writer',
    name: '创意写作助手',
    content: '你是一名富有创意的写作助手，善于创作各种文体的内容。请根据用户需求提供高质量的创意写作。',
    builtin: true,
    category: 'creative',
    description: '创意写作和内容创作',
  },
]

export function usePromptManager() {
  const prompts = reactive({
    builtin: builtinPrompts,
    custom: promptLibraryStorage.getCustomPrompts(),
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
    return getAllPrompts().find(prompt => prompt.id === id)
  }

  // 根据类别获取提示词
  const getPromptsByCategory = (category: string): PromptTemplate[] => {
    return getAllPrompts().filter(prompt => prompt.category === category)
  }

  // 搜索提示词
  const searchPrompts = (query: string): PromptTemplate[] => {
    const lowerQuery = query.toLowerCase()
    return getAllPrompts().filter(prompt =>
      prompt.name.toLowerCase().includes(lowerQuery)
      || prompt.content.toLowerCase().includes(lowerQuery)
      || (prompt.description && prompt.description.toLowerCase().includes(lowerQuery)),
    )
  }

  // 添加自定义提示词
  const addCustomPrompt = (prompt: Omit<PromptTemplate, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>): string => {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newPrompt: PromptTemplate = {
      ...prompt,
      id,
      builtin: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    prompts.custom.push(newPrompt)
    persistCustomPrompts()

    return id
  }

  // 更新自定义提示词
  const updateCustomPrompt = (id: string, updates: Partial<PromptTemplate>): boolean => {
    const index = prompts.custom.findIndex(prompt => prompt.id === id && !prompt.builtin)
    if (index === -1)
      return false

    const updated = {
      ...prompts.custom[index],
      ...updates,
      id, // 确保ID不被修改
      builtin: false, // 确保builtin标志不被修改
      updatedAt: Date.now(),
    }

    prompts.custom[index] = updated
    persistCustomPrompts()

    return true
  }

  // 删除自定义提示词
  const deleteCustomPrompt = (id: string): boolean => {
    const index = prompts.custom.findIndex(prompt => prompt.id === id && !prompt.builtin)
    if (index === -1)
      return false

    prompts.custom.splice(index, 1)
    persistCustomPrompts()

    return true
  }

  // 保存自定义提示词到存储
  const saveCustomPrompts = async () => {
    try {
      promptLibraryStorage.replaceCustomPrompts(prompts.custom)
      await promptLibraryStorage.saveToRemote({ force: true })
    }
    catch (error) {
      console.error('Failed to save custom prompts:', error)
    }
  }

  // 从存储加载自定义提示词
  const loadCustomPrompts = async () => {
    try {
      await promptLibraryStorage.reloadFromRemote()
      refreshCustomPrompts()
    }
    catch (error) {
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
          updatedAt: Date.now(),
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
    return prompts.custom.map(prompt => ({ ...prompt }))
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
    exportCustomPrompts,
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
