declare module '*.vue' {
  import type { Component } from 'vue'

  const component: Component
  export default component
}

declare module 'talex-touch:information' {
  export const packageJson: { name: string; version: string; [key: string]: unknown }
  const information: Record<string, unknown>
  export default information
}
