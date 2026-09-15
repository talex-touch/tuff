import { describe, expect, it } from 'vitest'
import {
  APP_FORMAT_PROFILES,
  DEFAULT_FORMAT_PROFILE,
  appFormatContextFromActiveApp,
  applyIdentifierCase,
  buildOrdinalList,
  collapseWhitespace,
  dropTrailingSentencePunctuation,
  formatDictationText,
  normalizeChineseNumerals,
  normalizePunctuationToAscii,
  removeSpokenFillers,
  resolveAppFormatProfile,
  stripSentencePunctuation,
  substituteSpokenSymbols
} from './index'

const TERMINAL = { bundleId: 'com.apple.Terminal' }
const CODE = { bundleId: 'com.microsoft.VSCode' }
const CHAT = { bundleId: 'com.tencent.xinWeChat' }
const NOTES = { bundleId: 'com.apple.Notes' }
const SHEET = { bundleId: 'com.microsoft.Excel' }

/** One utterance that every profile has an opinion about: fillers, an enumeration, a path, a time. */
const DICTATED =
  '呃，那个，帮我记一下，第一 检查 配置 第二 重启 服务，路径 是 斜杠 Users 斜杠 tagzixian 换行 明天下午三点 开会 嗯'

describe('spoken fillers', () => {
  it('drops an interjection the speaker paused around and keeps one clause separator', () => {
    expect(removeSpokenFillers('帮我记一下，就是，这样')).toBe('帮我记一下，这样')
    expect(removeSpokenFillers('明天开会，那个，记得带材料')).toBe('明天开会，记得带材料')
  })

  it('keeps a demonstrative or connective that carries meaning without a pause', () => {
    expect(removeSpokenFillers('这个 就是 答案')).toBe('就是 答案')
    expect(removeSpokenFillers('打开那个文件，然后把那个 文件 复制过来')).toBe(
      '打开那个文件，然后把那个 文件 复制过来'
    )
    expect(removeSpokenFillers('那个文件 很重要')).toBe('那个文件 很重要')
  })

  it('leaves nothing behind for an utterance that is nothing but fillers', () => {
    expect(removeSpokenFillers('呃，那个，').trim()).toBe('')
  })
})

describe('spoken symbols', () => {
  it('welds a dictated path into one token', () => {
    expect(substituteSpokenSymbols('路径 是 斜杠 Users 斜杠 tagzixian 下划线 log 点 json')).toBe(
      '路径 是 /Users/tagzixian_log.json'
    )
  })

  it('keeps the space a joiner stands on in prose but takes a deliberately isolated one', () => {
    expect(substituteSpokenSymbols('三点 见 配置 点 json 空格 done')).toBe('三点 见 配置.json done')
  })

  it('turns punctuation names and line breaks into their characters', () => {
    expect(substituteSpokenSymbols('先做这个 逗号 再做那个 感叹号')).toBe('先做这个，再做那个！')
    expect(substituteSpokenSymbols('第一行 换行 第二行')).toBe('第一行\n第二行')
  })
})

describe('punctuation transforms', () => {
  it('rewrites full-width punctuation as ASCII', () => {
    expect(normalizePunctuationToAscii('你好，世界。测试（完成）！')).toBe('你好,世界.测试(完成)!')
  })

  it('strips sentence punctuation but not the dot that is a file extension', () => {
    expect(stripSentencePunctuation('帮我记一下，第一，检查配置。')).toBe(
      '帮我记一下 第一 检查配置 '
    )
    expect(stripSentencePunctuation('配置 点 json')).toBe('配置 点 json')
  })

  it('drops only the punctuation that ends the text', () => {
    expect(dropTrailingSentencePunctuation('开会了。 ')).toBe('开会了')
    expect(dropTrailingSentencePunctuation('开会了。\n明天')).toBe('开会了。\n明天')
  })
})

describe('spoken numerals', () => {
  it('converts spoken numbers, including a bare 十', () => {
    expect(normalizeChineseNumerals('三点 二十 十五 两 十')).toBe('3点 20 15 2 10')
  })

  it('leaves idiomatic 一-words and unit-bearing numbers alone', () => {
    expect(normalizeChineseNumerals('一下 一样 唯一 统一 万一 十分 我们两个')).toBe(
      '一下 一样 唯一 统一 万一 十分 我们2个'
    )
    expect(normalizeChineseNumerals('一百二十三')).toBe('一百二十三')
  })
})

describe('markdown list construction', () => {
  it('turns a spoken enumeration into a numbered list under its lead sentence', () => {
    expect(buildOrdinalList('记得三件事，第一 检查配置，第二 重启服务，第三 通知团队')).toBe(
      '记得三件事\n\n1. 检查配置\n2. 重启服务\n3. 通知团队'
    )
  })

  it('consumes the particle of a spoken marker instead of leaving it as content', () => {
    expect(buildOrdinalList('第一点 检查配置，第二点 重启服务')).toBe('1. 检查配置\n2. 重启服务')
    expect(buildOrdinalList('第一、检查配置，第二、重启服务')).toBe('1. 检查配置\n2. 重启服务')
  })

  it('does not treat a single marker or a gap in the sequence as an enumeration', () => {
    expect(buildOrdinalList('第三点 需要确认')).toBe('第三点 需要确认')
    expect(buildOrdinalList('第三 检查 第五 重启')).toBe('第三 检查 第五 重启')
  })
})

describe('identifier casing', () => {
  it('rewrites a dictated word sequence in each supported style', () => {
    expect(applyIdentifierCase('get user name', 'camel')).toBe('getUserName')
    expect(applyIdentifierCase('user_profile_id', 'pascal')).toBe('UserProfileId')
    expect(applyIdentifierCase('user profile id', 'snake')).toBe('user_profile_id')
  })

  it('refuses to rewrite prose or a single word', () => {
    expect(applyIdentifierCase('检查 配置', 'camel')).toBe('检查 配置')
    expect(applyIdentifierCase('name', 'camel')).toBe('name')
  })
})

describe('whitespace', () => {
  it('collapses runs and trims while keeping paragraph breaks', () => {
    expect(collapseWhitespace('  你好   世界  \n\n\n  下一段  ')).toBe('你好 世界\n\n下一段')
  })
})

describe('resolveAppFormatProfile', () => {
  it('matches an exact bundle id regardless of case', () => {
    expect(resolveAppFormatProfile(TERMINAL).id).toBe('terminal')
    expect(resolveAppFormatProfile({ bundleId: 'COM.APPLE.TERMINAL' }).id).toBe('terminal')
  })

  it('matches a bundle id prefix for a suite with per-channel ids', () => {
    expect(resolveAppFormatProfile({ bundleId: 'com.jetbrains.pycharm' }).id).toBe('code')
    expect(resolveAppFormatProfile({ bundleId: 'com.microsoft.VSCodeRemote' }).id).toBe('code')
    expect(
      resolveAppFormatProfile({ bundleId: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App' }).id
    ).toBe('terminal')
  })

  it('falls back to the application name, then to the window title', () => {
    expect(resolveAppFormatProfile({ appName: 'Obsidian' }).id).toBe('notes')
    expect(resolveAppFormatProfile({ appName: 'Unknown', windowTitle: 'main.rs - proj' }).id).toBe(
      'code'
    )
  })

  it('falls back to the default profile for anything it does not recognize', () => {
    expect(resolveAppFormatProfile({ bundleId: 'com.example.nope', appName: 'Nope' }).id).toBe(
      'default'
    )
    expect(resolveAppFormatProfile({})).toBe(DEFAULT_FORMAT_PROFILE)
    expect(resolveAppFormatProfile(null)).toBe(DEFAULT_FORMAT_PROFILE)
  })

  it('adapts the frontmost-application record from the active-app service', () => {
    expect(appFormatContextFromActiveApp(null)).toBeNull()
    expect(
      appFormatContextFromActiveApp({
        identifier: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App',
        displayName: 'Windows Terminal',
        bundleId: null,
        processId: 1,
        executablePath: null,
        platform: 'windows',
        windowTitle: 'pwsh',
        lastUpdated: 0
      })
    ).toEqual({
      bundleId: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App',
      appName: 'Windows Terminal',
      windowTitle: 'pwsh'
    })
  })
})

describe('formatDictationText', () => {
  it('formats the same utterance differently for each application family', () => {
    expect(formatDictationText(DICTATED, TERMINAL).text).toBe(
      '帮我记一下,第1 检查 配置 第2 重启 服务,路径 是 /Users/tagzixian\n明天下午3点 开会'
    )
    expect(formatDictationText(DICTATED, CODE).text).toBe(
      '帮我记一下 第1 检查 配置 第2 重启 服务 路径 是 /Users/tagzixian\n明天下午3点 开会'
    )
    expect(formatDictationText(DICTATED, CHAT).text).toBe(
      '帮我记一下，第一 检查 配置 第二 重启 服务，路径 是 斜杠 Users 斜杠 tagzixian 换行 明天下午三点 开会'
    )
    expect(formatDictationText(DICTATED, NOTES).text).toBe(
      '帮我记一下\n\n1. 检查 配置\n2. 重启 服务，路径 是 /Users/tagzixian 明天下午3点 开会'
    )
    expect(formatDictationText(DICTATED, SHEET).text).toBe(
      '帮我记一下 第1 检查 配置 第2 重启 服务 路径 是 斜杠 Users 斜杠 tagzixian 换行 明天下午3点 开会'
    )
  })

  it('keeps the difference between terminal, chat and notes material, not cosmetic', () => {
    const terminal = formatDictationText(DICTATED, TERMINAL).text
    const chat = formatDictationText(DICTATED, CHAT).text
    const notes = formatDictationText(DICTATED, NOTES).text

    expect(new Set([terminal, chat, notes]).size).toBe(3)
    // A terminal gets ASCII commas and a real path; a chat keeps the speaker's words and punctuation.
    expect(terminal).toContain(',路径 是 /Users/tagzixian')
    expect(chat).toContain('是 斜杠 Users')
    expect(chat).toContain('三点')
    // Only notes gain structure.
    expect(notes).toContain('\n\n1. 检查 配置\n2. ')
  })

  it('leaves an unrecognized application with only whitespace collapsed', () => {
    const result = formatDictationText('呃，那个，斜杠 三点。', { bundleId: 'com.example.nope' })
    expect(result.profileId).toBe('default')
    expect(result.text).toBe('呃，那个，斜杠 三点。')
    expect(result.transforms).toEqual([])
  })

  it('reports only the transforms that changed the text', () => {
    expect(formatDictationText('ls -la', TERMINAL).transforms).toEqual([])
    expect(formatDictationText(DICTATED, CHAT).transforms).toEqual([
      'filler.remove',
      'whitespace.collapse'
    ])
    expect(formatDictationText(DICTATED, NOTES).transforms).toEqual([
      'filler.remove',
      'symbols.spoken',
      'list.ordinals',
      'numerals.chinese'
    ])
    // The terminal profile has no list transform, so the enumeration survives as `第1 检查`.
    expect(formatDictationText(DICTATED, TERMINAL).transforms).toEqual([
      'filler.remove',
      'symbols.spoken',
      'punctuation.ascii',
      'numerals.chinese',
      'whitespace.collapse'
    ])
  })

  it('applies the code profile identifier case end to end', () => {
    const result = formatDictationText('user_profile_id', CODE)
    expect(result.text).toBe('userProfileId')
    expect(result.transforms).toEqual(['identifier.case'])
  })

  it('never formats content into an empty string', () => {
    const inputs = [
      DICTATED,
      '呃，那个，',
      '就是，',
      '，。',
      '。',
      ' 斜杠 ',
      '第一',
      'ls -la',
      'user_profile_id'
    ]
    const targets = [
      ...APP_FORMAT_PROFILES.map((profile) => ({
        profile,
        ctx: { bundleId: profile.bundleIds[0] }
      })),
      { profile: DEFAULT_FORMAT_PROFILE, ctx: {} }
    ]
    for (const { profile, ctx } of targets) {
      // The loop is only worth anything if each iteration really formatted for that profile.
      expect(resolveAppFormatProfile(ctx).id).toBe(profile.id)
      for (const input of inputs) {
        const result = formatDictationText(input, ctx)
        expect(result.text.trim(), `${profile.id} emptied ${JSON.stringify(input)}`).not.toBe('')
      }
    }
  })

  it('returns nothing for input that carried nothing', () => {
    expect(formatDictationText('', TERMINAL)).toEqual({
      text: '',
      profileId: 'terminal',
      transforms: []
    })
    expect(formatDictationText('   ', TERMINAL)).toEqual({
      text: '',
      profileId: 'terminal',
      transforms: []
    })
    expect(formatDictationText('\t \n ', TERMINAL)).toEqual({
      text: '',
      profileId: 'terminal',
      transforms: []
    })
  })
})
