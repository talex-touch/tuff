import 'vitepress'

declare module 'vitepress' {
  namespace DefaultTheme {
    interface Config {
      sourceBase?: string
    }
  }
}
