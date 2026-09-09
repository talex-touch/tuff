import { describe, expect, it } from 'vitest'
import {
  detectSshEndpoint,
  detectSshPort,
  detectSshPublicKey,
} from '../clipboard/ssh-endpoint'

/**
 * 这一组几乎全是「什么不算」。识别 `ssh user@host` 是容易的部分；难的是不要把版本号
 * 当成 IP、不要把验证码当成端口、不要把散文里的 `ssh-rsa` 当成公钥。
 */
describe('detectSshPort', () => {
  it('never infers a port from a bare number', () => {
    // 与验证码同一条纪律：没有分隔符定位的数字串什么都不是。分类器已经因为
    // 「六位裸数字不算验证码」写过这个立场，端口不能反过来破坏它。
    expect(detectSshPort('8080')).toBeNull()
    expect(detectSshPort('123456')).toBeNull()
    expect(detectSshPort('端口是 22')).toBeNull()
  })

  it('reads a port only where a delimiter puts it', () => {
    expect(detectSshPort('ssh deploy@10.0.3.14 -p 2222')).toBe(2222)
    expect(detectSshPort('ssh -P 2200 host.example.com')).toBe(2200)
    expect(detectSshPort('localhost:8080')).toBe(8080)
    expect(detectSshPort('[::1]:22')).toBe(22)
    expect(detectSshPort('Host build\n  Port 2022\n')).toBe(2022)
  })

  it('rejects a number outside the port range', () => {
    expect(detectSshPort('localhost:0')).toBeNull()
    expect(detectSshPort('localhost:70000')).toBeNull()
  })

  it('does not read a clock as a port', () => {
    // `12:30` 前面不是主机形状，冒号规则不该碰它。
    expect(detectSshPort('会议 12:30 开始')).toBeNull()
  })
})

describe('detectSshEndpoint — IPv4 与版本号的歧义', () => {
  it('takes a private-range address as a host with no further evidence', () => {
    // 版本号落进 10./192.168. 是巧合，主机落进去是常态。
    expect(detectSshEndpoint('部署在 10.0.3.14 上')?.host).toBe('10.0.3.14')
    expect(detectSshEndpoint('192.168.1.1')?.host).toBe('192.168.1.1')
    expect(detectSshEndpoint('172.16.0.9')?.host).toBe('172.16.0.9')
    // 172.32 已经出了私有段。
    expect(detectSshEndpoint('升级到 172.32.0.9 之后')).toBeNull()
  })

  it('refuses a public four-part number sitting in prose', () => {
    expect(detectSshEndpoint('升级到 1.2.3.4 之后问题消失了')).toBeNull()
    expect(detectSshEndpoint('版本 8.8.8.8 的说明')).toBeNull()
  })

  it('takes a public address once something says it is a host', () => {
    expect(detectSshEndpoint('1.2.3.4')?.host).toBe('1.2.3.4')
    expect(detectSshEndpoint('ssh 8.8.8.8')?.host).toBe('8.8.8.8')
    expect(detectSshEndpoint('root@8.8.8.8')?.host).toBe('8.8.8.8')
    expect(detectSshEndpoint('8.8.8.8:22')?.host).toBe('8.8.8.8')
  })

  it('rejects a four-part number that is not a legal address', () => {
    expect(detectSshEndpoint('999.1.1.1')).toBeNull()
    expect(detectSshEndpoint('256.0.0.1')).toBeNull()
    // 前导零在不同解析器里含义不同，一律不认。
    expect(detectSshEndpoint('010.0.0.1')).toBeNull()
  })
})

describe('detectSshEndpoint — 字段拆解', () => {
  it('splits user, host and port out of an ssh invocation', () => {
    expect(detectSshEndpoint('ssh deploy@10.0.3.14 -p 2222')).toMatchObject({
      user: 'deploy',
      host: '10.0.3.14',
      hostIsIp: true,
      port: 2222,
    })
  })

  it('marks a domain host as not-an-ip so masking leaves it alone', () => {
    // 掩掉主机名就看不出连的是哪台了，掩码只针对 IP。
    expect(detectSshEndpoint('ssh deploy@build.example.com')).toMatchObject({
      user: 'deploy',
      host: 'build.example.com',
      hostIsIp: false,
      port: null,
    })
  })

  it('reports the host span so the caller can mask exactly it', () => {
    const content = 'ssh deploy@10.0.3.14 -p 2222'
    const endpoint = detectSshEndpoint(content)!
    expect(content.slice(endpoint.hostStart, endpoint.hostEnd)).toBe('10.0.3.14')
  })

  it('does not mistake an email address for a host', () => {
    // `someone@example.com` 和 `deploy@build.example.com` 字面上是同一个形状。
    // 域名形态的 user@host 要旁证才算端点，IP 形态的不用。
    expect(detectSshEndpoint('someone@example.com')).toBeNull()
    expect(detectSshEndpoint('联系 ops@example.com 处理')).toBeNull()
    expect(detectSshEndpoint('ssh ops@example.com')?.host).toBe('example.com')
    expect(detectSshEndpoint('ops@example.com:2222')?.port).toBe(2222)
    expect(detectSshEndpoint('deploy@10.0.3.14')?.host).toBe('10.0.3.14')
  })

  it('leaves a bare domain in prose alone', () => {
    // 没有 user@、不在 ssh 命令里，就只是一段提到网址的文字。
    expect(detectSshEndpoint('文档在 docs.example.com:8080 上')).toBeNull()
  })
})

describe('detectSshPublicKey', () => {
  it('reads the algorithm and the trailing comment', () => {
    const key = `ssh-ed25519 ${'A'.repeat(68)} deploy@laptop`
    expect(detectSshPublicKey(key)).toMatchObject({
      algorithm: 'ssh-ed25519',
      comment: 'deploy@laptop',
    })
  })

  it('accepts a key with no comment', () => {
    expect(detectSshPublicKey(`ssh-rsa ${'B'.repeat(200)}==`)?.comment).toBeNull()
    expect(detectSshPublicKey(`ecdsa-sha2-nistp256 ${'C'.repeat(64)}`)?.algorithm).toBe(
      'ecdsa-sha2-nistp256',
    )
  })

  it('refuses the algorithm name mentioned in prose', () => {
    // 光有 `ssh-rsa` 这个词不是公钥；base64 体至少 32 字符才作数。
    expect(detectSshPublicKey('我们还在用 ssh-rsa 密钥')).toBeNull()
    expect(detectSshPublicKey('ssh-rsa AAAA')).toBeNull()
  })
})
