/**
 * Built-in Agents
 *
 * Pre-configured agents that ship with Talex Touch.
 */

import { registerDataAgent } from './data-agent'
import { registerFileAgent } from './file-agent'
import { registerSearchAgent } from './search-agent'

/**
 * Register all built-in agents
 */
export function registerBuiltinAgents(): void {
  registerFileAgent()
  registerSearchAgent()
  registerDataAgent()
}

export { registerDataAgent } from './data-agent'
export { registerFileAgent } from './file-agent'
export { registerSearchAgent } from './search-agent'
