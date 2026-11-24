import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'
import TxAiErrorBlock from '../components/conversation/TxAiErrorBlock.vue'

function compileSfcStyle(relativePath: string): string {
  const dir = dirname(fileURLToPath(import.meta.url))
  const source = readFileSync(resolve(dir, relativePath), 'utf8')
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  if (!match) throw new Error(`Missing <style> block in ${relativePath}`)
  return sass.compileString(match[1] ?? '').css
}

describe('txAiErrorBlock', () => {
  it('renders localized title, detail, report line, and retry action', async () => {
    const wrapper = mount(TxAiErrorBlock, {
      props: {
        title: '网络请求超时',
        detail: '模型或提供商在规定时间内未响应。',
        codeLabel: '错误代码',
        reportCode: 'AI_RUN_FAILED',
        reportDetail: '请求在等待 120 秒后超时。',
        retryable: true,
        retryLabel: '重试',
      },
    })

    expect(wrapper.get('.tx-ai-error-block').attributes('role')).toBe('alert')
    expect(wrapper.get('.tx-ai-error-block-Title').text()).toBe('网络请求超时')
    expect(wrapper.get('.tx-ai-error-block-Detail').text()).toBe('模型或提供商在规定时间内未响应。')
    expect(wrapper.get('[data-testid="home-error-report"]').text()).toContain('错误代码: AI_RUN_FAILED')
    expect(wrapper.get('[data-testid="home-error-report"]').text()).toContain('请求在等待 120 秒后超时。')

    await wrapper.get('.tx-ai-error-block-Action').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[]])
  })

  it('compiles G2 continuous superellipse corners for both the card and its action button', () => {
    const css = compileSfcStyle('../components/conversation/TxAiErrorBlock.vue')

    expect(css).toMatch(
      /@supports\s*\(corner-shape:\s*superellipse\(2\)\)\s*\{[\s\S]*\.tx-ai-error-block\s*\{[\s\S]*border-radius:\s*calc\(var\(--shell-radius-lg,\s*12px\)\s*\*\s*var\(--tx-corner-smooth-scale,\s*1\.6\)\);[\s\S]*corner-shape:\s*var\(--tx-corner-smooth-shape,\s*superellipse\(1\.777\)\);/,
    )
    expect(css).toMatch(
      /@supports\s*\(corner-shape:\s*superellipse\(2\)\)\s*\{[\s\S]*\.tx-ai-error-block-Action\s*\{[\s\S]*border-radius:\s*calc\(13px\s*\*\s*var\(--tx-corner-smooth-scale,\s*1\.6\)\)\s*\/\s*50%;[\s\S]*corner-shape:\s*var\(--tx-corner-smooth-shape,\s*superellipse\(1\.777\)\);/,
    )
  })
})
