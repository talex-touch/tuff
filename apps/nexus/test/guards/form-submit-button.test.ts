import { describe, expect, it } from 'vitest'
import { historicalFixtures, loadHistoricalFixture } from './helpers/fixtures'
import { fileExists, formatViolations, loadSources, readSource } from './helpers/repo'
import { hasAttribute, hasEventListener, hasSpreadBinding, parseSfc, walkElements } from './helpers/sfc'
import type { SourceFile, Violation } from './helpers/repo'
import type { TemplateElement } from './helpers/sfc'

/**
 * Guard 2 — a tuffex button inside a submitting form must either submit it or
 * do something of its own.
 *
 * `TxButton` and `TxIconButton` both default `nativeType` to `'button'` and
 * render `<button :type="nativeType">`, so a button placed in
 * `<form @submit.prevent="...">` without `native-type="submit"` and without its
 * own `@click` is inert on click. Enter still submits the form, which is why
 * the dead send button on the intelligence-chat admin page went unnoticed
 * through review — it produced zero requests for every mouse user.
 */

const RULE = 'form-submit-button'

/**
 * Components whose rendered `<button>` is pinned to `type="button"` by default.
 * `TuffFlatButton` and `TxCopyButton` render a bare `<button>` and therefore
 * inherit the HTML `type="submit"` default — the opposite hazard, deliberately
 * not covered here.
 */
const BUTTONS_DEFAULTING_TO_TYPE_BUTTON = new Set(['TxButton', 'TxIconButton'])

const NATIVE_TYPE_ATTRIBUTES = ['native-type', 'nativeType']

function isSubmittingForm(element: TemplateElement): boolean {
  return element.tag === 'form' && hasEventListener(element, 'submit')
}

function declaresNativeType(element: TemplateElement): boolean {
  return NATIVE_TYPE_ATTRIBUTES.some(name => hasAttribute(element, name))
}

export function scanFormSubmitButtons(files: SourceFile[]): Violation[] {
  const violations: Violation[] = []

  for (const file of files) {
    const { templateRoot } = parseSfc(file.content, file.path)
    walkElements(templateRoot, (element, ancestors) => {
      if (!BUTTONS_DEFAULTING_TO_TYPE_BUTTON.has(element.tag))
        return
      if (!ancestors.some(isSubmittingForm))
        return
      if (declaresNativeType(element) || hasEventListener(element, 'click'))
        return
      // `v-bind="attrs"` / `v-on="handlers"` can supply either one; the guard
      // cannot see through them and stays quiet rather than guessing.
      if (hasSpreadBinding(element))
        return

      violations.push({
        file: file.path,
        line: element.loc.start.line,
        rule: RULE,
        message: `<${element.tag}> sits inside a <form @submit> but declares neither native-type nor @click. `
          + `${element.tag} defaults nativeType to 'button', so clicking it does nothing — only the Enter key `
          + `submits. Fix: add native-type="submit" to submit the form, or @click to give it its own action.`,
      })
    })
  }

  return violations
}

describe('guard: buttons inside submitting forms are not inert', () => {
  it('flags the shipped dead send button', () => {
    const entry = historicalFixtures.formSubmitButton
    const violations = scanFormSubmitButtons([loadHistoricalFixture(entry)])
    expect(violations, entry.expectation).toHaveLength(1)
    expect(violations[0]!.line).toBe(246)
    expect(violations[0]!.file).toBe(entry.originalPath)
  })

  it('accepts a button once native-type="submit" is added', () => {
    // Negative control against the shipped fix, so the assertion above cannot
    // be passing because the scanner flags every TxButton it sees.
    const fixed = 'app/pages/dashboard/admin/intelligence-chat.vue'
    if (!fileExists(fixed))
      return
    expect(formatViolations(scanFormSubmitButtons([readSource(fixed)]))).toBe('')
  })

  it('accepts a button that carries its own @click', () => {
    const synthetic: SourceFile = {
      path: 'test/guards/synthetic/own-click.vue',
      content: [
        '<template>',
        '  <form @submit.prevent="save">',
        '    <TxButton @click="reset">Reset</TxButton>',
        '    <TxButton native-type="submit">Save</TxButton>',
        '    <TxButton :native-type="mode">Bound</TxButton>',
        '  </form>',
        '</template>',
      ].join('\n'),
    }
    expect(formatViolations(scanFormSubmitButtons([synthetic]))).toBe('')
  })

  it('ignores buttons outside a submitting form', () => {
    const synthetic: SourceFile = {
      path: 'test/guards/synthetic/outside-form.vue',
      content: [
        '<template>',
        '  <div>',
        '    <TxButton>Decorative</TxButton>',
        '  </div>',
        '  <form>',
        '    <TxButton>No submit handler</TxButton>',
        '  </form>',
        '</template>',
      ].join('\n'),
    }
    expect(formatViolations(scanFormSubmitButtons([synthetic]))).toBe('')
  })

  it('reports no inert form buttons in app/', () => {
    expect(formatViolations(scanFormSubmitButtons(loadSources('app', ['.vue'])))).toBe('')
  })
})
