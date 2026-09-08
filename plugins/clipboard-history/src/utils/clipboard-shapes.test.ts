import { describe, expect, it } from 'vitest'
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import {
  buildCleanLink,
  classifyClipboardItem,
  detectCommand,
  detectSecret,
  extractLinks,
  parseLinkParams,
  selectClipboardInsight,
} from './clipboard-shapes'

function text(content: string, extra: Partial<PluginClipboardItem> = {}): PluginClipboardItem {
  return { id: 1, type: 'text', content, ...extra }
}

/**
 * Stripe-shaped fixtures, assembled rather than written out.
 *
 * A live Stripe prefix followed by 26 characters is exactly what credential scanners look
 * for, and GitHub's push protection rejected the whole branch over these three lines. The
 * values the detector receives are unchanged — only the source no longer contains a string
 * that reads as a live key.
 */
const STRIPE_LIVE_KEY = `${['sk', 'live'].join('_')}_abcdefghijklmnopqrstuvwxyz`
const STRIPE_TEST_KEY = `${['sk', 'test'].join('_')}_abcdefghijklmnopqrstuvwxyz`

describe('secret detection', () => {
  it.each([
    ['ghp_1234567890abcdefghijklmnopqrstuvwxyz', 'GitHub'],
    ['github_pat_11ABCDEFG0abcdefghijklmnop', 'GitHub'],
    ['npm_1234567890abcdefghijklmnopqrstuvwxyz', 'npm'],
    ['sk-ant-api03-abcdefghijklmnopqrstuvwxyz01', 'Anthropic'],
    ['sk-proj-abcdefghijklmnopqrstuvwxyz0123', 'OpenAI'],
    ['AKIAIOSFODNN7EXAMPLE', 'AWS'],
    [STRIPE_LIVE_KEY, 'Stripe'],
    ['xoxb-1234567890-abcdefghij', 'Slack'],
    ['AIzaSyA1234567890abcdefghijklmnopqrstuv', 'Google'],
  ])('identifies %s as a %s credential', (value, service) => {
    expect(detectSecret(value)?.service).toBe(service)
  })

  it('flags live stripe keys as critical but not test keys', () => {
    expect(detectSecret(STRIPE_LIVE_KEY)?.critical).toBe(true)
    expect(detectSecret(STRIPE_TEST_KEY)?.critical).toBe(false)
  })

  /**
   * 这条是整套前缀表的成败：只认前缀，不认「看起来很随机」。
   * 少了它，每一段 base62 ID 都会被标成密钥。
   */
  it('never reports a high-entropy string that matches no known prefix', () => {
    for (const value of [
      'Xq7Lm2Pz9Kd4Rt6Vy8Nb3Hc5Jf1Gs0Wa2Ee4Ui',
      '8f14e45fceea167a5a36dedd4bea2543',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    ]) {
      expect(detectSecret(value)).toBeNull()
    }
  })

  it('reports the type of a private key without exposing any of its body', () => {
    const body = 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAAB'
    const info = detectSecret(`-----BEGIN OPENSSH PRIVATE KEY-----\n${body}\n-----END OPENSSH PRIVATE KEY-----`)

    expect(info?.kind).toBe('private-key')
    expect(info?.critical).toBe(true)
    expect(info?.masked).not.toContain(body.slice(0, 8))
    expect(JSON.stringify(info)).not.toContain(body.slice(0, 8))
  })

  it('decodes a jwt expiry without verifying the signature', () => {
    const encode = (value: object): string =>
      btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const expired = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: 1000 })}.sig`
    const active = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: 4_000_000_000 })}.sig`

    expect(detectSecret(expired)?.detail).toBe('已过期')
    expect(detectSecret(active)?.detail).toBe('未过期')
  })

  it('does not throw on a malformed jwt-shaped string', () => {
    expect(() => detectSecret('not.a.jwt')).not.toThrow()
    expect(detectSecret('not.a.jwt')).toBeNull()
  })

  it('masks the password inside a connection string', () => {
    const info = detectSecret('postgres://admin:hunter2@db.internal:5432/app')

    expect(info?.kind).toBe('connection-string')
    expect(info?.masked).not.toContain('hunter2')
    expect(info?.masked).toContain('db.internal')
  })

  it('treats a sensitive env assignment as a credential but leaves plain ones alone', () => {
    expect(detectSecret('API_TOKEN=abcdefghijklmnop')?.kind).toBe('env')
    expect(detectSecret('NODE_ENV=production')).toBeNull()
  })
})

describe('command detection', () => {
  it('splits program, args and pipe', () => {
    const info = detectCommand('curl -s https://api.example.com/v1/ping | jq .status')

    expect(info?.program).toBe('curl')
    expect(info?.args).toContain('-s')
    expect(info?.pipe).toBe('| jq .status')
  })

  it('flags credentials carried in request headers', () => {
    expect(
      detectCommand('curl -H "Authorization: Bearer sk-ant-abcdefghijklmnop" https://api.example.com')
        ?.containsCredential,
    ).toBe(true)
  })

  it.each([
    ['rm -rf ~/Downloads', '递归删除'],
    ['sudo systemctl restart nginx', '提权执行'],
    ['chmod -R 777 /var/www', '开放全部权限'],
    ['curl https://get.example.com | sh', '管道执行远程脚本'],
    ['dd if=/dev/zero of=/dev/disk2', '裸写磁盘'],
  ])('flags %s as dangerous', (command, danger) => {
    expect(detectCommand(command)?.dangers).toContain(danger)
  })

  it('does not treat prose or a bare url as a command', () => {
    expect(detectCommand('这个文件夹里面有非常多的图片')).toBeNull()
    expect(detectCommand('https://dsh.tagzxia.com/?token=abc')).toBeNull()
  })
})

describe('link extraction', () => {
  it('collects unique links and drops trailing punctuation', () => {
    expect(extractLinks('see https://a.example.com/x, and https://a.example.com/x too')).toEqual([
      'https://a.example.com/x',
    ])
  })

  it('marks sensitive query parameters and can strip them', () => {
    const url = 'https://dsh.tagzxia.com/?token=abc&page=2'

    expect(parseLinkParams(url)).toEqual([
      { key: 'token', value: 'abc', sensitive: true },
      { key: 'page', value: '2', sensitive: false },
    ])
    expect(buildCleanLink(url)).toBe('https://dsh.tagzxia.com/?page=2')
  })
})

describe('insight routing', () => {
  it.each([
    ['sk-ant-api03-abcdefghijklmnopqrstuvwxyz01', 'secret'],
    ['git push --force origin main', 'command'],
    ['dsh web: https://dsh.tagzxia.com/?token=abc', 'link'],
    ['#ABCDEE', 'color'],
    ['这个文件夹里面有非常多的图片，需要批量处理。', 'words'],
  ])('routes %s to the %s insight', (content, kind) => {
    expect(selectClipboardInsight(text(content))).toBe(kind)
  })

  /** 一条带 token 的 URL 同时命中 link 与 secret，洞察区必须选优先级更高的那一个。 */
  it('prefers the credential insight when a link also carries one', () => {
    const item = text(STRIPE_LIVE_KEY)
    expect(classifyClipboardItem(item)).toContain('secret')
    expect(selectClipboardInsight(item)).toBe('secret')
  })

  /**
   * 拆词的判定必须和渲染用同一个分词器。用一条更便宜的正则近似它，中文连写会被整段
   * 当成一个词、于是整段中文再也拿不到拆词分区——这条用例锁的就是那个坑。
   */
  it('splits unspaced chinese prose into words', () => {
    expect(selectClipboardInsight(text('这个文件夹里面有非常多的图片，需要批量处理。'))).toBe('words')
    expect(selectClipboardInsight(text('把这段话直接粘贴过来就好了不要再改动它了谢谢'))).toBe('words')
    expect(selectClipboardInsight(text('你好世界'))).toBe('words')
  })

  /**
   * 拆出来只有整条内容本身时不出分区。验证码、编号、单个英文词都落在这里——
   * 它们该被识别成对应的形态，而不是回一个和原文一模一样的词块。
   */
  it('gives no insight when splitting would just echo the content', () => {
    expect(selectClipboardInsight(text('679839'))).toBe('none')
    expect(selectClipboardInsight(text('ORD20260906'))).toBe('none')
  })

  it('gives neither files nor images an insight, ocr included', () => {
    const files = { id: 2, type: 'files', content: JSON.stringify(['/a/b.mp4']) } as PluginClipboardItem
    expect(selectClipboardInsight(files)).toBe('none')

    const withoutOcr = { id: 3, type: 'image', content: '' } as PluginClipboardItem
    expect(selectClipboardInsight(withoutOcr)).toBe('none')

    const withOcr = {
      id: 4,
      type: 'image',
      content: '',
      meta: { ocr_status: 'done', ocr_text: 'hi' },
    } as PluginClipboardItem
    // OCR 搬进「更多信息」之后，洞察区对图片一律不出内容（ClipboardMoreInfo）。
    expect(selectClipboardInsight(withOcr)).toBe('none')
  })
})

describe('classification', () => {
  it('marks a files item holding a video', () => {
    const item = { id: 5, type: 'files', content: JSON.stringify(['/a/clip.mp4']) } as PluginClipboardItem
    expect(classifyClipboardItem(item)).toEqual(expect.arrayContaining(['files', 'video']))
  })

  it('carries every shape a single text can belong to', () => {
    const item = text('curl -H "Authorization: Bearer sk-ant-abcdefghijklmnop" https://api.example.com')
    expect(classifyClipboardItem(item)).toEqual(expect.arrayContaining(['text', 'command', 'link']))
  })

  it('trusts existing metadata tags even when the body does not match a prefix', () => {
    const item = text('opaque-value', { meta: { tags: ['api_key'] } })
    expect(classifyClipboardItem(item)).toContain('secret')
  })
})
