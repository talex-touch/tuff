import { describe, expect, it } from 'vitest'
import { resolveAppSemanticAliases } from './app-semantic-catalog'

describe('app semantic alias catalog', () => {
  it('resolves AI and local LLM app aliases', () => {
    expect(
      resolveAppSemanticAliases({
        name: 'ChatGPT',
        bundleId: 'com.openai.chatgpt',
        path: '/Applications/ChatGPT.app'
      })
    ).toEqual(expect.arrayContaining(['ai', 'agent', 'llm', 'assistant', 'chatgpt']))

    expect(
      resolveAppSemanticAliases({
        name: 'LM Studio',
        path: '/Applications/LM Studio.app'
      })
    ).toEqual(expect.arrayContaining(['ai', 'llm', 'local llm', '本地模型']))
  })

  it('resolves database, API and DevOps aliases without assigning git to IDEs', () => {
    expect(resolveAppSemanticAliases({ name: 'TablePlus' })).toEqual(
      expect.arrayContaining(['db', 'database', 'sql', '数据库'])
    )
    expect(resolveAppSemanticAliases({ name: 'Apifox' })).toEqual(
      expect.arrayContaining(['api', 'http', '接口'])
    )
    expect(resolveAppSemanticAliases({ name: 'Docker Desktop' })).toEqual(
      expect.arrayContaining(['devops', 'container', 'docker', '容器'])
    )
    expect(resolveAppSemanticAliases({ name: 'Visual Studio Code' })).not.toContain('git')
  })

  it('resolves screenshot, media, archive and transfer aliases', () => {
    expect(resolveAppSemanticAliases({ name: 'Snipaste' })).toEqual(
      expect.arrayContaining(['screenshot', 'capture', 'ocr', '截图'])
    )
    expect(resolveAppSemanticAliases({ name: 'DaVinci Resolve' })).toEqual(
      expect.arrayContaining(['video', 'edit video', '剪辑', '调色'])
    )
    expect(resolveAppSemanticAliases({ name: 'Keka' })).toEqual(
      expect.arrayContaining(['zip', 'archive', 'compress', '解压'])
    )
    expect(resolveAppSemanticAliases({ name: 'FileZilla' })).toEqual(
      expect.arrayContaining(['ftp', 'sftp', 'transfer', '传输'])
    )
  })

  it('resolves security, network, remote and virtualization aliases', () => {
    expect(resolveAppSemanticAliases({ name: '1Password' })).toEqual(
      expect.arrayContaining(['password', 'secret', '2fa', '密码'])
    )
    expect(resolveAppSemanticAliases({ name: 'Tailscale' })).toEqual(
      expect.arrayContaining(['vpn', 'network', 'remote', '远程'])
    )
    expect(resolveAppSemanticAliases({ name: 'Termius' })).toEqual(
      expect.arrayContaining(['terminal', 'ssh', 'remote'])
    )
    expect(resolveAppSemanticAliases({ name: 'Parallels Desktop' })).toEqual(
      expect.arrayContaining(['vm', 'virtual', '虚拟机'])
    )
  })

  it('resolves China-focused browser, cloud and product design apps', () => {
    expect(resolveAppSemanticAliases({ name: '夸克浏览器' })).toEqual(
      expect.arrayContaining(['browser', '浏览器', 'quark'])
    )
    expect(resolveAppSemanticAliases({ name: '阿里云盘' })).toEqual(
      expect.arrayContaining(['cloud', 'drive', '云盘', 'aliyun drive'])
    )
    expect(resolveAppSemanticAliases({ name: '即时设计' })).toEqual(
      expect.arrayContaining(['design', 'prototype', '产品设计', '原型'])
    )
  })

  it('keeps ambiguous Illustrator away from the AI alias', () => {
    const aliases = resolveAppSemanticAliases({
      name: 'Adobe Illustrator',
      bundleId: 'com.adobe.illustrator'
    })

    expect(aliases).toEqual(expect.arrayContaining(['design', 'illustrator', '矢量']))
    expect(aliases).not.toContain('ai')
  })
})
