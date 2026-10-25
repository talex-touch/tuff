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

/**
 * Evaluates a query expression against the parsed input: `this` is the input, as the query bar's
 * label and placeholder say, and the input's keys are in scope as bare names.
 */
export function evaluateQuery(expression: string, data: any): unknown {
  // `with` cannot set `this`, so the expression runs in a function made inside the `with` block
  // and called on the input. That function is strict: a sloppy one would swap a null input for the
  // global object, which is what `this` used to be for every query.
  // eslint-disable-next-line no-new-func
  const bind = new Function('data', `with(data) { return function () { "use strict"; return ${expression} } }`)
  return bind({ ...data }).call(data)
}
