import { createHash, createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BaiduTranslateProvider, md5Hex } from './src/providers/baidu-translate'
import { CustomTranslateProvider } from './src/providers/custom-translate'
import { DeepLTranslateProvider } from './src/providers/deepl-translate'
import { signTencentTc3Request, TencentTranslateProvider } from './src/providers/tencent-translate'
import { isSafeAudioUrl, validateProviderApiUrl } from './src/utils/url-validation'

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('./src/providers/plugin-network-client', () => ({
  getPluginNetworkClient: () => ({
    request: networkMocks.request,
  }),
}))

function nodeTc3Reference(params: {
  secretId: string
  secretKey: string
  host: string
  payload: string
  timestamp: string
}) {
  const service = 'tmt'
  const date = new Date(Number.parseInt(params.timestamp, 10) * 1000).toISOString().slice(0, 10)
  const contentType = 'application/json; charset=utf-8'
  const canonicalHeaders = `content-type:${contentType}\nhost:${params.host}\n`
  const signedHeaders = 'content-type;host'
  const hashedPayload = createHash('sha256').update(params.payload, 'utf8').digest('hex')
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonical = createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  const stringToSign = ['TC3-HMAC-SHA256', params.timestamp, credentialScope, hashedCanonical].join('\n')
  const secretDate = createHmac('sha256', `TC3${params.secretKey}`).update(date, 'utf8').digest()
  const secretService = createHmac('sha256', secretDate).update(service, 'utf8').digest()
  const secretSigning = createHmac('sha256', secretService).update('tc3_request', 'utf8').digest()
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')
  return `TC3-HMAC-SHA256 Credential=${params.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

describe('touch-translation provider crypto & API contracts', () => {
  beforeEach(() => {
    networkMocks.request.mockReset()
  })

  it('computes RFC 1321 MD5 digests accurately for ASCII and UTF-8 inputs and signs Baidu requests', async () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5Hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    expect(md5Hex('你好世界')).toBe(createHash('md5').update('你好世界', 'utf8').digest('hex'))

    const provider = new BaiduTranslateProvider()
    provider.config.appId = '20260001'
    provider.config.secretKey = 'baidu-secret-test'
    networkMocks.request.mockResolvedValueOnce({
      data: { from: 'en', trans_result: [{ dst: '你好' }] },
    })

    const result = await provider.translate({ text: 'hello', targetLanguage: 'zh', sourceLanguage: 'en' })
    expect(result.text).toBe('你好')

    const body = String(networkMocks.request.mock.calls[0]?.[0]?.body ?? '')
    const params = new URLSearchParams(body)
    const salt = params.get('salt') || ''
    const expectedSign = createHash('md5')
      .update(`20260001hello${salt}baidu-secret-test`, 'utf8')
      .digest('hex')
    expect(params.get('sign')).toBe(expectedSign)
  })

  it('computes exact Tencent TC3-HMAC-SHA256 Authorization header and fails closed without SubtleCrypto', async () => {
    const payload = JSON.stringify({ SourceText: 'hello', Source: 'auto', Target: 'zh', ProjectId: 0 })
    const timestamp = '1700000000'
    const actual = await signTencentTc3Request({
      secretId: 'AKIDexample',
      secretKey: 'SecretKeyExample',
      host: 'tmt.tencentcloudapi.com',
      payload,
      timestamp,
    })
    const expected = nodeTc3Reference({
      secretId: 'AKIDexample',
      secretKey: 'SecretKeyExample',
      host: 'tmt.tencentcloudapi.com',
      payload,
      timestamp,
    })
    expect(actual).toBe(expected)

    const provider = new TencentTranslateProvider()
    provider.config.secretId = 'AKIDexample'
    provider.config.secretKey = 'SecretKeyExample'
    networkMocks.request.mockResolvedValueOnce({
      data: { Response: { TargetText: '你好', Source: 'en' } },
    })

    const res = await provider.translate({ text: 'hello', targetLanguage: 'zh' })
    expect(res.text).toBe('你好')
    const sentAuth = networkMocks.request.mock.calls[0]?.[0]?.headers?.Authorization as string
    expect(sentAuth).toMatch(/^TC3-HMAC-SHA256 Credential=AKIDexample\/\d{4}-\d{2}-\d{2}\/tmt\/tc3_request, SignedHeaders=content-type;host, Signature=[0-9a-f]{64}$/)

    // Fail closed when crypto.subtle is unavailable
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
    try {
      await expect(
        signTencentTc3Request({
          secretId: 'AKIDexample',
          secretKey: 'SecretKeyExample',
          host: 'tmt.tencentcloudapi.com',
          payload,
          timestamp,
        }),
      ).rejects.toThrow(/SubtleCrypto/)
    }
    finally {
      Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true })
    }
  })

  it('uses DeepL v2 payload and parses translations[0].text', async () => {
    const provider = new DeepLTranslateProvider()
    provider.config.apiKey = 'deepl-key'
    networkMocks.request.mockResolvedValueOnce({
      data: {
        translations: [{ detected_source_language: 'EN', text: '世界你好' }],
      },
    })

    const result = await provider.translate({ text: 'hello world', targetLanguage: 'zh', sourceLanguage: 'auto' })
    expect(result.text).toBe('世界你好')
    expect(result.sourceLanguage).toBe('en')
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      body: {
        text: ['hello world'],
        target_lang: 'ZH',
      },
    }))
  })

  it('honors custom-translate configured prompt and enforces HTTPS for external endpoints', async () => {
    const provider = new CustomTranslateProvider()
    provider.setConfig({
      apiUrl: 'https://api.example.com/v1/chat/completions',
      apiKey: 'test-key',
      prompt: 'Translate formally to {{targetLanguage}}: {{text}}',
    })
    networkMocks.request.mockResolvedValueOnce({
      data: { choices: [{ message: { content: '您好' } }] },
    })

    const result = await provider.translate({ text: 'hello $&', targetLanguage: 'zh' })
    expect(result.text).toBe('您好')
    expect(networkMocks.request.mock.calls[0]?.[0]?.body?.messages?.[0]?.content).toBe(
      'Translate formally to 中文: hello $&',
    )

    provider.setConfig({ apiUrl: 'http://api.example.com/v1/chat/completions' })
    await expect(provider.translate({ text: 'hello', targetLanguage: 'zh' })).rejects.toThrow(/HTTPS/)
  })

  it('validates provider API URLs and audio playback URL schemes', () => {
    expect(validateProviderApiUrl('https://api-free.deepl.com/v2/translate').valid).toBe(true)
    expect(validateProviderApiUrl('http://127.0.0.1:11434/v1/chat/completions').valid).toBe(true)
    expect(validateProviderApiUrl('http://localhost:8080/translate').valid).toBe(true)
    expect(validateProviderApiUrl('http://api-free.deepl.com/v2/translate').valid).toBe(false)
    expect(validateProviderApiUrl('file:///etc/passwd').valid).toBe(false)

    expect(isSafeAudioUrl('https://cdn.example.com/pronounce.mp3')).toBe(true)
    expect(isSafeAudioUrl('blob:https://app.example.com/123')).toBe(true)
    expect(isSafeAudioUrl('data:audio/mpeg;base64,SUQz')).toBe(true)
    expect(isSafeAudioUrl('http://cdn.example.com/pronounce.mp3')).toBe(false)
    expect(isSafeAudioUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeAudioUrl('file:///tmp/evil.mp3')).toBe(false)
    expect(isSafeAudioUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })
})
