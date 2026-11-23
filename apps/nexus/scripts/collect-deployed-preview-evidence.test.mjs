import { describe, expect, it } from 'vitest'
import {
  apiProbes,
  CHROMIUM_LAUNCH_OPTIONS,
  extractServiceWorkerPrecacheUrls,
  parseArgs,
  relativeEvidencePath,
  resolveOutputEvidenceFile,
  resolveOutputRoot,
  routeBudgets,
  summarizeBfcacheResult,
  summarizeServiceWorkerPrecache,
} from './collect-deployed-preview-evidence.mjs'

describe('collect-deployed-preview-evidence helpers', () => {
  it('extracts SW precache URLs from both minified Workbox object literals and JSON-quoted manifests', () => {
    const minifiedSw = 'define(["./workbox-01f28f5c"],function(e){"use strict";e.precacheAndRoute([{url:"pwa-512x512.png",revision:"a"},{url:"pwa-192x192.png",revision:"b"},{url:"maskable-icon.png",revision:"c"},{url:"logo.svg",revision:"d"},{url:"favicon.ico",revision:"e"},{url:"apple-touch-icon.png",revision:"f"},{url:"_nuxt/builds/latest.json",revision:"g"},{url:"_nuxt/builds/meta/5a060bf1.json",revision:null},{url:"manifest.webmanifest",revision:"h"}],{})});'
    const summary = summarizeServiceWorkerPrecache(minifiedSw)

    expect(summary.total).toBe(9)
    expect(summary.docs).toEqual([])
    expect(summary.routeHtml).toEqual([])
    expect(summary.nuxtChunkAssets).toEqual([])
    expect(summary.nuxtBuildMetadata).toEqual([
      '_nuxt/builds/latest.json',
      '_nuxt/builds/meta/5a060bf1.json',
    ])
    expect(summary.runtimeContentAssets).toEqual([])

    const quotedSw = 'precacheAndRoute([{"url":"logo.svg","revision":"1"},{"url":\'_nuxt/builds/latest.json\',"revision":"2"}], {})'
    expect(extractServiceWorkerPrecacheUrls(quotedSw)).toEqual([
      'logo.svg',
      '_nuxt/builds/latest.json',
    ])
  })

  it('parses --output-dir and resolves both relative and absolute output directories safely', () => {
    const args = parseArgs(['--base-url', 'https://tuff.tagzxia.com', '--output-dir', '/tmp/tuff-nexus-probe'])
    expect(args).toEqual({
      'base-url': 'https://tuff.tagzxia.com',
      'output-dir': '/tmp/tuff-nexus-probe',
    })

    const inlineArgs = parseArgs(['--output-dir=/tmp/probe=1', '--dry-run'])
    expect(inlineArgs).toEqual({
      'output-dir': '/tmp/probe=1',
      'dry-run': true,
    })

    expect(resolveOutputRoot(undefined, '/repo')).toBe('/repo/output/playwright')
    expect(resolveOutputRoot('output/custom', '/repo')).toBe('/repo/output/custom')
    expect(resolveOutputRoot('/tmp/tuff-nexus-probe', '/repo')).toBe('/tmp/tuff-nexus-probe')
    expect(() => resolveOutputRoot(true, '/repo')).toThrow(/--output-dir requires/)
    expect(() => resolveOutputRoot('   ', '/repo')).toThrow(/--output-dir requires/)

    expect(relativeEvidencePath('/repo/output/playwright/a.json', '/repo')).toBe('output/playwright/a.json')
    expect(relativeEvidencePath('/tmp/tuff-nexus-probe/a.json', '/repo')).toBe('/tmp/tuff-nexus-probe/a.json')

    expect(resolveOutputEvidenceFile('/tmp/tuff-nexus-probe', '/tmp/tuff-nexus-probe/auth.json', 'auth state'))
      .toBe('/tmp/tuff-nexus-probe/auth.json')
    expect(() => resolveOutputEvidenceFile('/tmp/tuff-nexus-probe', '/tmp/other/auth.json', 'auth state'))
      .toThrow(/must live under/)
  })

  it('probes canonical static docs endpoints and guards legacy query-string 404 routes without relaxing route budgets', () => {
    const probeMap = new Map(apiProbes.map(probe => [probe.name, probe]))

    expect(probeMap.get('docs page full body')).toEqual({
      name: 'docs page full body',
      path: '/api/docs/page/en/body/dev/components/tabs.json',
      expected: [200],
    })
    expect(probeMap.get('docs navigation')).toEqual({
      name: 'docs navigation',
      path: '/api/docs/navigation/en/all',
      expected: [200],
    })
    expect(probeMap.get('docs sidebar components')).toEqual({
      name: 'docs sidebar components',
      path: '/api/docs/sidebar-components/en',
      expected: [200],
    })
    expect(probeMap.get('docs query guard (page)')?.expected).toEqual([404])
    expect(probeMap.get('docs query guard (navigation)')?.expected).toEqual([404])
    expect(probeMap.get('docs query guard (sidebar-components)')?.expected).toEqual([404])

    // Budgets remain strictly unchanged.
    expect(routeBudgets.find(route => route.key === 'docs-tabs')).toMatchObject({ maxDocs: 1, maxNuxt: 40, maxTotal: 50 })
    expect(routeBudgets.find(route => route.key === 'store')).toMatchObject({ maxDocs: 0, maxNuxt: 75, maxTotal: 80 })
    expect(routeBudgets.find(route => route.key === 'pricing')).toMatchObject({ maxDocs: 0, maxNuxt: 30, maxTotal: 35 })
    expect(routeBudgets.find(route => route.key === 'sign-in')).toMatchObject({ maxDocs: 0, maxNuxt: 45, maxTotal: 50 })
    expect(routeBudgets.find(route => route.key === 'dashboard')).toMatchObject({ maxDocs: 0, maxNuxt: 60, maxTotal: 70 })
    expect(routeBudgets.find(route => route.key === 'auth-app-callback')).toMatchObject({ maxDocs: 0, maxNuxt: 50, maxTotal: 55 })
  })

  it('enables Chromium bfcache and records back_forward when pageshow.persisted is true', () => {
    expect(CHROMIUM_LAUNCH_OPTIONS.ignoreDefaultArgs).toContain('--disable-back-forward-cache')

    const hit = summarizeBfcacheResult({
      href: 'https://tuff.tagzxia.com/en/docs/dev/components/tabs',
      navigationType: 'navigate',
      events: [
        { type: 'pageshow', persisted: false },
        { type: 'pagehide', persisted: true },
        { type: 'pageshow', persisted: true },
      ],
    }, 'output/playwright/test.har')

    expect(hit.realBfcacheHit).toBe(true)
    expect(hit.navigationType).toBe('back_forward')
    expect(hit.rawPerformanceNavigationType).toBe('navigate')
    expect(hit.pageshowPersisted).toEqual([false, true])

    const miss = summarizeBfcacheResult({
      href: 'https://tuff.tagzxia.com/en/docs/dev/components/tabs',
      navigationType: 'back_forward',
      events: [{ type: 'pageshow', persisted: false }],
    }, 'output/playwright/test.har')

    expect(miss.realBfcacheHit).toBe(false)
    expect(miss.navigationType).toBe('back_forward')
  })
})
