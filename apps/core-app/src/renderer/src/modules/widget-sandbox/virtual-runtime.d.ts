/**
 * Ambient, and in its own file on purpose: `env.d.ts` has top-level imports, so
 * it is a module, and a `declare module` inside a module is an *augmentation* —
 * which fails for an id that has no real file behind it.
 *
 * Backed by `widgetSandboxRuntimePlugin` in electron.vite.config.ts.
 */
declare module 'virtual:widget-sandbox-runtime' {
  /** The arrow runtime's ES module source, injected into the widget sandbox. */
  const source: string
  export default source
}
