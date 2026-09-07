import { describe, expect, it } from 'vitest'
import {
  classifyClipboardContent,
  maskSecretSpans,
  type ClipboardClassifyInput,
} from '../clipboard/content-classifier'

function classify(content: string, extra: Partial<ClipboardClassifyInput> = {}) {
  return classifyClipboardContent({ type: 'text', content, ...extra })
}

const OPENAI_KEY = `sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`
const GITHUB_KEY = `ghp_${'A'.repeat(36)}`

describe('clipboard content classifier', () => {
  /**
   * 这是合并两套分类器要修的那个洞：主进程在正文里搜子串所以给它挂了「API 密钥」标签，
   * 插件要求整条内容就是密钥所以判定为否、把 key 明文渲染了出来。
   * 判定带 span 之后，"整条是密钥"只是区间覆盖全文的特例。
   */
  it('finds a secret embedded in a sentence, not just a whole-content one', () => {
    const whole = classify(OPENAI_KEY)
    const embedded = classify(`记得配置 api_key: ${OPENAI_KEY} 然后重启`)

    expect(whole.secrets).toHaveLength(1)
    expect(whole.secrets[0]).toMatchObject({ start: 0, end: OPENAI_KEY.length, service: 'OpenAI' })

    expect(embedded.secrets.length).toBeGreaterThan(0)
    const hit = embedded.secrets[0]!
    expect(embedded.tags).toContain('api_key')
    expect(maskSecretSpans(`记得配置 api_key: ${OPENAI_KEY} 然后重启`, embedded.secrets)).not.toContain(
      OPENAI_KEY,
    )
    expect(hit.start).toBeGreaterThan(0)
  })

  it('recognises the structural secrets the main process used to miss entirely', () => {
    const privateKey = classify('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQE\n-----END RSA PRIVATE KEY-----')
    const jwt = classify('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop')
    const dsn = classify('postgres://admin:hunter2@db.internal:5432/app')

    expect(privateKey.tags).toContain('private_key')
    expect(privateKey.retentionClass).toBe('secret')
    expect(jwt.tags).toContain('jwt')
    expect(dsn.tags).toContain('connection_string')
    expect(dsn.secrets[0]?.critical).toBe(true)
  })

  it('keeps the service name when it knows it, and admits when it does not', () => {
    expect(classify(GITHUB_KEY).secrets[0]?.service).toBe('GitHub')
    // 自建网关：sub2api 的 key 前缀是每个部署自己配的，硬编码 `cr_` 既会漏又会误报。
    const unknown = classify('cr_aB3xK9mQ2pL7vN4tR8wY')
    expect(unknown.tags).toContain('api_key')
    expect(unknown.secrets[0]?.service).toBeNull()
  })

  it('does not call an ordinary underscored phrase a key', () => {
    expect(classify('my_documentation_folder_for_things').secrets).toEqual([])
    expect(classify('用户名 is zhang_san_2026').tags).not.toContain('api_key')
  })

  /**
   * 字段式规则（`token is xxx`）咬到过普通英文散文。以前这只是个多余的 UI 标签；
   * 现在同一个判定还决定「永不自动删除」和打码，所以假阳性会让用户读不到自己的正文、
   * 而且这条记录永远删不掉。纯小写无数字的值是散文词，不是凭据。
   */
  it('does not treat an English sentence about a token as a credential', () => {
    const prose = classify('token is important for this project')
    expect(prose.secrets).toEqual([])
    expect(prose.retentionClass).toBe('ordinary')

    expect(classify('the password is complicated').secrets).toEqual([])

    // 真的凭据仍然要认出来。判据是「短的纯小写」，不是「纯小写」——
    // 只看后者会把 `Bearer abcdefghijklmnop` 这种全小写的真 token 一起误杀。
    expect(classify('token: aB3xK9mQ2pL7').secrets).toHaveLength(1)
    expect(classify('password is Str0ngP@ssw0rd').secrets).toHaveLength(1)
    expect(classify('Authorization: Bearer abcdefghijklmnop').secrets).toHaveLength(1)
  })

  describe('verification codes', () => {
    it('accepts a prefixed code, a keyword sentence, and a messaging-app digit run', () => {
      expect(classify('G-123456').verificationCode).toMatchObject({ value: '123456', source: 'prefixed' })
      expect(classify('您的验证码是 493028，5 分钟内有效').verificationCode).toMatchObject({
        value: '493028',
        source: 'keyword',
      })
      expect(
        classify('679839', { sourceApp: 'com.apple.MobileSMS' }).verificationCode,
      ).toMatchObject({ value: '679839', source: 'messaging-app' })
    })

    /**
     * 负控制。误判的代价是一小时后自动删除，而订单号、金额、年月、PIN、门牌号
     * 都是同一个形状——所以裸数字必须有来源佐证才算验证码。
     */
    it('refuses a bare digit run with no evidence of where it came from', () => {
      expect(classify('679839').verificationCode).toBeNull()
      expect(classify('679839', { sourceApp: 'com.apple.Safari' }).verificationCode).toBeNull()
      expect(classify('ORD20260906').verificationCode).toBeNull()
      expect(classify('这份文件我已经验证过了，没问题').verificationCode).toBeNull()
    })

    it('treats a key that happens to contain digits as a key, not a code', () => {
      const result = classify(`验证码相关的 key 是 ${OPENAI_KEY}`)
      expect(result.retentionClass).toBe('secret')
      expect(result.verificationCode).toBeNull()
    })
  })

  describe('retention class', () => {
    it.each([
      [OPENAI_KEY, 'secret'],
      ['G-123456', 'verification-code'],
      ['今天下午三点开会', 'ordinary'],
    ])('routes %s to %s', (content, expected) => {
      expect(classify(content).retentionClass).toBe(expected)
    })

    it('gives images and files no classification at all', () => {
      expect(classifyClipboardContent({ type: 'image', content: 'data:image/png;base64,AA' }).tags).toEqual([])
      expect(classifyClipboardContent({ type: 'files', content: '["/a/b.txt"]' }).retentionClass).toBe('ordinary')
    })
  })

  /**
   * 合并两套分类器会改变主进程既有的 tag 产出，而 tag 参与搜索和 UI 标签。
   * 这张表是合并前逐条比对过的差异结论：新增的都是主进程原本完全漏掉的形态，
   * 删掉的都是咬到散文的假阳性。任何新的差异都要重新解释一次，不能默默改掉。
   */
  describe('tag output, pinned against the pre-merge tagger', () => {
    it.each([
      // 与旧实现一致的部分
      [`sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`, ['api_key', 'openai']],
      [GITHUB_KEY, ['api_key', 'github']],
      ['AKIAABCDEFGHIJKLMNOP', ['api_key', 'aws']],
      ['sk_live_abcdefghijklmnopqrst', ['api_key', 'stripe']],
      ['xoxb-1234567890-abcdefg', ['api_key', 'slack']],
      ['username: zhangsan', ['account']],
      ['https://example.com/docs?token=abc', ['url']],
      ['someone@example.com', ['email']],
      ['password: Str0ngP@ssw0rd', ['password']],
      ['今天下午三点开会', []],

      // 新增：主进程原本完全不认这些形态，只有插件认
      ['-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----', ['private_key']],
      ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop', ['jwt']],
      ['API_TOKEN=abcdefghijklmnop', ['api_key']],

      // 新增：本次新增的两类判定
      ['G-123456', ['verification_code']],
      ['cr_aB3xK9mQ2pL7vN4tR8wY', ['api_key']],

      // 删除：旧实现把散文咬成了凭据
      ['token is important for this project', []],
      ['the password is complicated', []],
    ])('tags %s as %s', (content, expected) => {
      expect(classify(content).tags).toEqual(expected)
    })

    /** 更具体的规则必须先赢：通用字段规则先占住区间的话，服务名标签会连同判定一起丢掉。 */
    it('keeps the service tag when a field-style match wraps a known key', () => {
      expect(classify(`api_key: ${OPENAI_KEY}`).tags).toEqual(['api_key', 'openai'])
    })
  })

  describe('masking', () => {    it('never lets private key material through, not even a prefix', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQE\n-----END RSA PRIVATE KEY-----'
      const masked = maskSecretSpans(content, classify(content).secrets)
      expect(masked).not.toContain('MIIEowIBAAKCAQE')
      expect(masked).toBe('私钥内容不予显示')
    })

    it('masks only the credential inside a connection string, keeping it readable', () => {
      const content = 'postgres://admin:hunter2@db.internal:5432/app'
      const masked = maskSecretSpans(content, classify(content).secrets)
      expect(masked).not.toContain('hunter2')
      expect(masked).toContain('db.internal')
    })

    it('leaves the surrounding sentence intact', () => {
      const content = `记得配置 api_key: ${OPENAI_KEY} 然后重启`
      const masked = maskSecretSpans(content, classify(content).secrets)
      expect(masked).toContain('记得配置')
      expect(masked).toContain('然后重启')
      expect(masked).not.toContain(OPENAI_KEY)
    })

    it('returns the content untouched when nothing was found', () => {
      expect(maskSecretSpans('plain text', [])).toBe('plain text')
    })
  })
})
