export interface AiDemoScenario {
  id: 'chat' | 'assist' | 'preview'
  label: string
  icon: string
}

export interface ChatMessage {
  role: 'user' | 'ai'
  content: string
}

export interface AssistAction {
  id: 'ask' | 'fixSpelling' | 'translate'
  label: string
  icon?: string
}

export interface AssistDemo {
  action: AssistAction['id']
  originalText: string
  result: string
}

export interface PreviewScenario {
  input: string
  type: 'expression' | 'currency' | 'time' | 'unit' | 'color' | 'constant' | 'text'
  result: string
  extra?: string
  details?: Record<string, string>
}
