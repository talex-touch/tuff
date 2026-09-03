import { describe, expect, it } from 'vitest'
import { detectClipboardTags, getClipboardTagSearchTerms } from './clipboard-tagging'

describe('detectClipboardTags', () => {
  it('detects url tags from text', () => {
    const tags = detectClipboardTags({
      type: 'text',
      content: 'Visit https://example.com for details.',
      rawContent: null
    })
    expect(tags).toContain('url')
  })

  it('detects api key and password/account patterns', () => {
    const tags = detectClipboardTags({
      type: 'text',
      content: 'username: alice\npassword: hunter2\napi_key=sk-1234567890abcdef',
      rawContent: null
    })
    expect(tags).toEqual(['api_key', 'password', 'account'])
  })

  it('detects email and bearer token patterns', () => {
    const tags = detectClipboardTags({
      type: 'text',
      content: 'contact: dev@example.com\nAuthorization: Bearer abcdefghijklmnop',
      rawContent: null
    })
    expect(tags).toEqual(['token', 'email'])
  })

  it.each(['@wx', '@wechat', '微信'])('classifies the WeChat alias %s', (content) => {
    expect(detectClipboardTags({ type: 'text', content })).toEqual(['wechat'])
  })

  it('projects every WeChat spelling into clipboard metadata search terms', () => {
    expect(getClipboardTagSearchTerms(['wechat'])).toEqual(
      expect.arrayContaining(['wx', 'wechat', '微信'])
    )
  })

  it.each([
    ['GitHub personal access token', `ghp_${'a'.repeat(36)}`, ['api_key', 'github']],
    ['npm access token', `npm_${'a'.repeat(36)}`, ['api_key', 'npm']],
    ['OpenAI project API key', `sk-proj-${'a'.repeat(20)}`, ['api_key', 'openai']],
    ['Stripe test secret key', `sk_test_${'a'.repeat(16)}`, ['api_key', 'stripe']],
    ['Google API key', `AIza${'a'.repeat(35)}`, ['api_key', 'google']],
    ['AWS access key ID', `AKIA${'A'.repeat(16)}`, ['api_key', 'aws']],
    ['Slack bot token', `xoxb-${'a'.repeat(10)}`, ['api_key', 'slack']]
  ])('classifies a supported %s', (_name, content, expected) => {
    expect(detectClipboardTags({ type: 'text', content })).toEqual(expected)
  })

  it.each([
    ['short GitHub-like prefix', 'ghp_short'],
    ['short npm-like prefix', 'npm_short'],
    ['short OpenAI-like prefix', 'sk-short'],
    ['short Stripe-like prefix', 'sk_test_short'],
    ['short Google-like prefix', `AIza${'a'.repeat(34)}`],
    ['short AWS-like prefix', `AKIA${'A'.repeat(15)}`],
    ['short Slack-like prefix', 'xoxb-short']
  ])('does not classify an ambiguous %s', (_name, content) => {
    expect(detectClipboardTags({ type: 'text', content })).toEqual([])
  })

  it('ignores non-text clipboard items', () => {
    const tags = detectClipboardTags({
      type: 'image',
      content: 'data:image/png;base64,abc',
      rawContent: null
    })
    expect(tags).toEqual([])
  })
})
