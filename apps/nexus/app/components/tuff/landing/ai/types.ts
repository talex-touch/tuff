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
  corrections?: Array<{
    original: string
    corrected: string
    start: number
    end: number
  }>
}

export interface PreviewScenario {
  input: string
  type: 'expression' | 'currency' | 'time' | 'unit' | 'color' | 'constant' | 'text' | 'hash' | 'encode'
  result: string
  extra?: string
  icon?: string
  details?: Record<string, string>
}
