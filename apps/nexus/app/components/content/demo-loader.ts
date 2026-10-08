import type { Component } from 'vue'

export interface DemoModule {
  default: Component
}

export type DemoLoader = () => Promise<DemoModule>
