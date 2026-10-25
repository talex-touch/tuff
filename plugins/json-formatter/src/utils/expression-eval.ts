/**
 * The plugin's two evaluations of user input. This module imports nothing and the build gives it
 * a chunk of its own (see `vite.config.ts`), so that chunk, and the security waiver pinned to its
 * sha256, change only when this file does.
 */

/** Evaluates a JavaScript object or array literal that `smartParse` has already screened. */
export function evaluateObjectLiteral(source: string): unknown {
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict"; return (${source})`)()
}

/** Evaluates a query expression with the keys of the parsed input in scope. */
export function evaluateQuery(expression: string, data: any): unknown {
  // eslint-disable-next-line no-new-func
  const fn = new Function('data', `with(data) { return ${expression} }`)
  return fn({ this: data, ...data })
}
