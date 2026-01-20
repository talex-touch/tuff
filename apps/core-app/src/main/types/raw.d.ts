declare module '*.css?raw' {
  const content: string
  export default content
}

declare module '*.svg?raw' {
  const content: string
  export default content
}

declare module 'talex-mica-electron' {
  export function useMicaElectron(path?: string): void
}
