export interface PromptTemplate {
  id: string
  name: string
  content: string
  builtin: boolean
  category?: string
  description?: string
  createdAt?: number
  updatedAt?: number
}
