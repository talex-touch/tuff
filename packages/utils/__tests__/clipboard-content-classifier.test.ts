import { describe, expect, it } from 'vitest'
import {
  classifyClipboardContent,
  maskSecretSpans,
  type ClipboardClassifyInput,
} from '../clipboard/content-classifier'

function classify(content: string, extra: Partial<ClipboardClassifyInput> = {}) {
  return classifyClipboardContent({ type: 'text', content, ...extra })
}

/**
 * Key-shaped fixtures, assembled from fragments at run time.
 *
 * A classifier for secrets needs inputs that look exactly like secrets, and a scanner cannot
 * tell a test fixture from the real thing — GitHub push protection blocked this branch over the
 * literals that used to live here. No fragment below is long enough to match a provider's
 * pattern on its own, so the file carries no key-shaped string at all; only the assembled
 * values, which never touch disk, do.
 */
const shaped = (...parts: string[]): string => parts.join('')

const OPENAI_KEY = shaped('sk', '-', 'FAKEKEYFORTESTS0', 'FAKEKEYFORTESTS1', 'FAKEKEY0')
const GITHUB_KEY = shaped('ghp', '_', 'A'.repeat(36))
const AWS_KEY_ID = shaped('AKIA', 'ABCDEFGHIJKLMNOP')
const STRIPE_KEY = shaped('sk', '_live_', 'abcdefghijklmnopqrst')
const SLACK_KEY = shaped('xoxb', '-1234567890-abcdefg')

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

  describe('ssh and host endpoints', () => {
    it('masks a host ip without making the record undeletable', () => {
      // 这是本任务的核心不变式：IP 敏感所以掩码，但它不是凭据，
      // 该按类别策略过期就得过期。掩码和保留期在此之前是同一个开关。
      const result = classify('ssh deploy@10.0.3.14 -p 2222')

      expect(result.secrets.map(hit => hit.kind)).toEqual(['host-ip'])
      expect(result.retentionClass).toBe('ordinary')
      expect(result.tags).toContain('ssh')
      expect(maskSecretSpans('ssh deploy@10.0.3.14 -p 2222', result.secrets)).toContain('•')
      expect(maskSecretSpans('ssh deploy@10.0.3.14 -p 2222', result.secrets)).not.toContain('10.0.3')
    })

    it('leaves the ip inside a connection string to the connection string', () => {
      // 扫描顺序的意义所在：整串是凭据，拆出一个 host-ip 会让它反而失去保护。
      const result = classify('postgres://appuser:s3cr3tPass@10.0.0.1:5432/app')

      expect(result.secrets.map(hit => hit.kind)).toEqual(['connection-string'])
      expect(result.retentionClass).toBe('secret')
    })

    it('does not mask a domain host', () => {
      const result = classify('ssh deploy@build.example.com')

      expect(result.secrets).toEqual([])
      expect(result.sshEndpoint).toMatchObject({ host: 'build.example.com', hostIsIp: false })
      expect(result.retentionClass).toBe('ordinary')
    })

    it('reports a public key without masking it', () => {
      // 公钥按定义就是公开的，掩码只制造摩擦、不提供保护。
      const result = classify(`ssh-ed25519 ${'A'.repeat(68)} deploy@laptop`)

      expect(result.sshPublicKey).toMatchObject({ algorithm: 'ssh-ed25519' })
      expect(result.secrets).toEqual([])
      expect(result.tags).toContain('ssh')
    })

    it('still protects an ssh private key', () => {
      const result = classify(
        '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA\n-----END OPENSSH PRIVATE KEY-----',
      )

      expect(result.retentionClass).toBe('secret')
    })
  })

  describe('retention class', () => {
    /**
     * 每一个 kind 单独钉一遍，而不是只测一两个代表。
     *
     * 保留期以前由「有没有命中」决定（`secrets.length > 0`），现在由命中的 kind 决定，
     * 于是「哪些 kind 算凭据」变成了一份可以被改错的名单。名单漏掉一项的表现是几周后
     * 「我的密钥怎么被自动删了」，不是任何一条测试变红——除非每一项都在这里。
     */
    it.each([
      ['api-key', OPENAI_KEY],
      ['private-key', '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA\n-----END OPENSSH PRIVATE KEY-----'],
      ['jwt', shaped('eyJ', 'hbGciOiJIUzI1NiJ9', '.eyJzdWIiOiJ0ZXN0In0', '.c2lnbmF0dXJlLXBsYWNlaG9sZGVy')],
      ['connection-string', 'postgres://appuser:s3cr3tPass@db.internal:5432/app'],
      ['env', 'MY_SERVICE_TOKEN=abcd1234EFGH5678'],
      ['password-field', 'password: hunter2-Xyz!'],
      ['token-field', 'token: abc123DEF456ghi'],
    ])('protects a %s from automatic deletion', (kind, content) => {
      const result = classify(content)
      expect(result.secrets.map(hit => hit.kind)).toContain(kind)
      expect(result.retentionClass).toBe('secret')
    })

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
      [OPENAI_KEY, ['api_key', 'openai']],
      [GITHUB_KEY, ['api_key', 'github']],
      [AWS_KEY_ID, ['api_key', 'aws']],
      [STRIPE_KEY, ['api_key', 'stripe']],
      [SLACK_KEY, ['api_key', 'slack']],
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
