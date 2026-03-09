export interface ThHistoryMessage {
  role?: string
  content?: string
  date?: string
  _agent?: string
  agent?: unknown
  [key: string]: unknown
}

export interface ThHistory {
  id?: string
  topic?: string
  messages: ThHistoryMessage[]
  [key: string]: unknown
}
