// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import type { WidgetSandboxEvidence } from '@talex-touch/utils/plugin/widget'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { registerCustomRenderer, unregisterCustomRenderer } from '~/modules/box/custom-render'
import WidgetFrame from './WidgetFrame.vue'

// WidgetFrame calls useI18n() in setup, and mounting it without an installed
// i18n instance throws 'Need to install with `app.use` function' before a single
// assertion runs. Same stub shape MetaOverlay.test.ts uses.
//
// t(key, fallback): with no catalogue loaded vue-i18n resolves to the fallback,
// so mirror that rather than echoing the key back.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key
  })
}))

import {
  WIDGET_SANDBOX_AUDIT_MAX_ENTRIES,
  WIDGET_SANDBOX_QUOTA_MAX_CALLS,
  WIDGET_SANDBOX_QUOTA_WINDOW_MS,
  clearWidgetSandboxAuditLog,
  createWidgetSandboxPolicy,
  disposeWidgetSandboxPolicy,
  getWidgetSandboxAuditLog
} from '~/modules/plugin/widget-sandbox-policy'

const widgetIds = new Set<string>()
let nextWidgetId = 0

function createEvidence(widgetId: string): WidgetSandboxEvidence {
  return {
    widgetId,
    pluginName: 'widget-frame-test-plugin',
    featureId: 'widget-frame-test-feature',
    sourceType: 'js',
    declaredDependencies: [],
    allowedDependencies: [],
    blockedDependencies: [],
    undeclaredDependencies: [],
    storageFacade: {
      localStorage: 'secure-namespaced',
      sessionStorage: 'memory-namespaced',
      cookies: 'secure-namespaced',
      indexedDB: 'plugin-namespaced',
      caches: 'plugin-namespaced',
      broadcastChannel: 'plugin-namespaced'
    },
    browserFacade: {
      clipboard: 'blocked-use-host-action',
      history: 'memory-isolated',
      location: 'read-only-snapshot',
      postMessage: 'widget-local',
      worker: 'blocked',
      serviceWorker: 'blocked',
      network: 'blocked-use-host-action',
      domNavigation: 'blocked'
    },
    windowBoundary: {
      opener: 'null',
      top: 'sandbox-proxy',
      parent: 'sandbox-proxy',
      self: 'sandbox-proxy',
      globalThis: 'sandbox-proxy',
      documentDefaultView: 'sandbox-proxy',
      documentRealm: 'detached-document'
    },
    quota: {
      windowMs: WIDGET_SANDBOX_QUOTA_WINDOW_MS,
      maxCalls: WIDGET_SANDBOX_QUOTA_MAX_CALLS,
      usedCalls: 0,
      blockedCalls: 0,
      resetsAt: 0
    },
    audit: {
      mode: 'bounded-memory',
      maxEntries: WIDGET_SANDBOX_AUDIT_MAX_ENTRIES,
      payloads: 'excluded'
    },
    dynamicExecution: {
      mode: 'guarded-new-function',
      realm: 'same-realm',
      boundary: 'host-api-containment',
      sourcePreflight: 'lexical-denylist',
      injectedGlobals: [],
      limitations: [
        'Shares JavaScript intrinsics with the host renderer',
        'Not a process, origin, or realm isolation boundary'
      ]
    }
  }
}

function registerFramePolicy(): string {
  const widgetId = `widget-frame-test::${nextWidgetId++}`
  widgetIds.add(widgetId)
  createWidgetSandboxPolicy('widget-frame-test-plugin', widgetId, createEvidence(widgetId))
  return widgetId
}

afterEach(() => {
  for (const widgetId of widgetIds) {
    disposeWidgetSandboxPolicy(widgetId)
    clearWidgetSandboxAuditLog(widgetId)
  }
  widgetIds.clear()
  document.body.replaceChildren()
})

describe('WidgetFrame navigation containment', () => {
  it('captures anchor clicks and form submissions before DOM navigation reaches the browser', () => {
    const widgetId = registerFramePolicy()
    const wrapper = mount(WidgetFrame, { props: { rendererId: widgetId } })
    const anchor = document.createElement('a')
    anchor.href = 'https://outside.invalid/'
    const form = document.createElement('form')
    form.action = 'https://outside.invalid/submit'
    wrapper.element.append(anchor, form)

    const anchorClick = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    const formSubmit = new Event('submit', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(anchorClick)
    form.dispatchEvent(formSubmit)

    expect(anchorClick.defaultPrevented).toBe(true)
    expect(formSubmit.defaultPrevented).toBe(true)
    expect(getWidgetSandboxAuditLog(widgetId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'dom.navigation', decision: 'denied' })
      ])
    )
    wrapper.unmount()
  })

  it('recovers shadow mode after a render error and syncs styles safely for special rendererIds', async () => {
    const brokenId = 'widget-frame-broken::1'
    const validId = 'widget"special\\id::2'
    const brokenUnmounted = vi.fn()

    registerCustomRenderer(
      brokenId,
      defineComponent({
        name: 'BrokenShadowWidget',
        setup() {
          return () => {
            throw new Error('boom inside shadow')
          }
        },
        unmounted: brokenUnmounted
      })
    )
    registerCustomRenderer(
      validId,
      defineComponent({
        name: 'HealthyShadowWidget',
        setup() {
          return () => h('div', { class: 'healthy-shadow-content' }, 'Shadow recovered')
        }
      })
    )

    const styleEl = document.createElement('style')
    styleEl.dataset.widgetId = validId
    styleEl.textContent = '.healthy-shadow-content { color: teal; }'
    document.head.appendChild(styleEl)

    try {
      const wrapper = mount(WidgetFrame, {
        props: { rendererId: brokenId, renderMode: 'shadow' }
      })
      await nextTick()

      expect(wrapper.find('.WidgetFrame-Error').exists()).toBe(true)
      expect(wrapper.text()).toContain('boom inside shadow')
      expect(wrapper.find('.WidgetFrame-ShadowHost').exists()).toBe(false)

      await wrapper.setProps({ rendererId: validId })
      await nextTick()
      await nextTick()

      expect(wrapper.find('.WidgetFrame-Error').exists()).toBe(false)
      const shadowHost = wrapper.find('.WidgetFrame-ShadowHost').element as HTMLElement
      expect(shadowHost.shadowRoot).toBeTruthy()
      expect(shadowHost.shadowRoot?.textContent).toContain('Shadow recovered')
      expect(shadowHost.shadowRoot?.querySelector('style')?.textContent).toContain('color: teal')

      wrapper.unmount()
    } finally {
      unregisterCustomRenderer(brokenId)
      unregisterCustomRenderer(validId)
      styleEl.remove()
    }
  })
})
