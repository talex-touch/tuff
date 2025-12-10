/**
 * Agent Tools
 *
 * Built-in tools for agents to use.
 */

export { registerFileTools } from './file-tools'

/**
 * Register all built-in tools
 */
export function registerBuiltinTools(): void {
  // Import and register all tool categories
  const { registerFileTools } = require('./file-tools')
  registerFileTools()
}
