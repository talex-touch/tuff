import { describe, expect, it } from 'vitest'
import { resolveAppSemanticAliases } from './app-semantic-catalog'
import { getAppToolSourceCatalogSummary, resolveAppToolSourceIds } from './app-tool-source-catalog'

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

  it('resolves tool-only source aliases for high frequency CoreBox tools', () => {
    const cases = [
      {
        app: {
          name: 'Adobe Photoshop 2026',
          bundleId: 'com.adobe.Photoshop',
          path: '/Applications/Adobe Photoshop 2026.app'
        },
        sourceIds: ['design'],
        aliases: ['design', 'ps', 'photoshop']
      },
      {
        app: {
          name: 'Codex',
          bundleId: 'OpenAI.Codex_2p2nqsd0c76g0',
          launchTarget: 'OpenAI.Codex_2p2nqsd0c76g0!App'
        },
        sourceIds: ['dev'],
        aliases: ['dev', 'codex', 'code']
      },
      {
        app: {
          name: 'Visual Studio Code',
          bundleId: 'com.microsoft.VSCode',
          path: '/Applications/Visual Studio Code.app'
        },
        sourceIds: ['dev'],
        aliases: ['dev', 'vscode', 'code']
      },
      {
        app: { name: '飞书', bundleId: 'com.bytedance.feishu' },
        sourceIds: ['im'],
        aliases: ['im', 'feishu', '飞书']
      },
      {
        app: { name: '微信', bundleId: 'com.tencent.xin' },
        sourceIds: ['im'],
        aliases: ['im', 'wechat', '微信']
      },
      {
        app: { name: 'Telegram', bundleId: 'org.telegram.desktop' },
        sourceIds: ['im'],
        aliases: ['im', 'telegram', 'tg']
      }
    ]

    for (const entry of cases) {
      expect(resolveAppToolSourceIds(entry.app)).toEqual(entry.sourceIds)
      expect(resolveAppSemanticAliases(entry.app)).toEqual(expect.arrayContaining(entry.aliases))
    }

    expect(getAppToolSourceCatalogSummary()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'dev', appCount: 2 }),
        expect.objectContaining({ sourceId: 'im', appCount: 3 }),
        expect.objectContaining({ sourceId: 'design', appCount: 1 })
      ])
    )
  })

  it('requires token boundaries so short needles cannot attach through substrings', () => {
    const postgres = resolveAppSemanticAliases({
      name: 'Postgres',
      bundleId: 'com.postgresapp.Postgres2',
      path: '/Applications/Postgres.app'
    })
    expect(postgres).not.toContain('telegram')
    expect(postgres).not.toContain('im')
    expect(
      resolveAppToolSourceIds({ name: 'Postgres', path: '/Applications/Postgres.app' })
    ).toEqual([])

    const homeDirApp = resolveAppSemanticAliases({
      name: 'Some Editor',
      path: '/Users/tim/Applications/Some Editor.app'
    })
    expect(homeDirApp).not.toContain('im')
    expect(homeDirApp).not.toContain('聊天')

    expect(
      resolveAppSemanticAliases({ name: 'Telegram', bundleId: 'org.telegram.desktop' })
    ).toEqual(expect.arrayContaining(['im', 'telegram', 'tg']))
    expect(resolveAppSemanticAliases({ name: 'TIM', bundleId: 'com.tencent.tim' })).toEqual(
      expect.arrayContaining(['im', 'tim'])
    )
    expect(resolveAppSemanticAliases({ name: 'UTM', path: '/Applications/UTM.app' })).toEqual(
      expect.arrayContaining(['vm', 'virtual', 'utm'])
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
