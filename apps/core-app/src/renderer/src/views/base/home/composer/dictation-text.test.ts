import { describe, expect, it } from 'vitest'
import { mergeTranscript, spliceDictation, spokenSegment } from './dictation-text'

describe('spokenSegment', () => {
  it('drops a segment of punctuation alone, the way a capture of silence comes back', () => {
    for (const silence of ['。。。。。。。。。。', '...', '，。！？', '  ', '', '……', '~']) {
      expect(spokenSegment(silence), JSON.stringify(silence)).toBe('')
    }
  })

  it('keeps anything with a letter, a digit or an ideograph, punctuation included', () => {
    for (const speech of ['好', '你好。。。', '3', 'ok.', 'こんにちは', '안녕', '12:30']) {
      expect(spokenSegment(speech)).toBe(speech)
    }
  })

  it('drops a whole-segment subtitle credit in half- or full-width brackets', () => {
    for (const credit of [
      '(字幕:J Chong)',
      '（字幕：J Chong）',
      '[字幕制作 小明]',
      '【字幕】',
      '［字幕由 Amara.org 社区提供］',
      '(Subtitles by the Amara.org community)',
      ' (字幕:J Chong)。'
    ]) {
      expect(spokenSegment(credit), credit).toBe('')
    }
  })

  it('drops the known silence hallucinations, in any case and with their punctuation', () => {
    for (const credit of [
      '字幕由Amara.org社区提供',
      '字幕由 Amara.org 社区提供。',
      '请不吝点赞 订阅 转发 打赏支持明镜与点点栏目',
      '请不吝点赞、订阅、转发、打赏支持明镜与点点栏目',
      'Thanks for watching',
      'Thanks for watching!',
      'thank you for watching.',
      'Subtitles by the Amara.org community'
    ]) {
      expect(spokenSegment(credit), credit).toBe('')
    }
  })

  it('keeps the same words inside a sentence: only a whole segment is a hallucination', () => {
    for (const speech of [
      '我在写字幕',
      '字幕 (字幕:J Chong)',
      '(字幕:J Chong) 请继续',
      'Thanks for watching the kids yesterday',
      'I said thanks for watching',
      '(见附件)',
      '请把字幕由英文改成中文'
    ]) {
      expect(spokenSegment(speech), speech).toBe(speech)
    }
  })
})

describe('mergeTranscript', () => {
  it('replaces a partial with the next, longer version of itself', () => {
    expect(mergeTranscript('今天', '今天天气')).toBe('今天天气')
    expect(mergeTranscript('hello', 'hello world')).toBe('hello world')
  })

  it('keeps the longer text when a revision repeats or shortens it', () => {
    expect(mergeTranscript('hello world', 'hello world')).toBe('hello world')
    expect(mergeTranscript('hello world', 'hello')).toBe('hello world')
  })

  it('joins an overlapping continuation on the overlap', () => {
    expect(mergeTranscript('我们明天', '明天下午见')).toBe('我们明天下午见')
    expect(mergeTranscript('see you to', 'tomorrow')).toBe('see you tomorrow')
  })

  it('appends with a space between Latin words and none next to CJK', () => {
    expect(mergeTranscript('Hello', 'World')).toBe('Hello World')
    expect(mergeTranscript('你好', '世界')).toBe('你好世界')
    expect(mergeTranscript('打开 Tuff', '设置')).toBe('打开 Tuff设置')
    // Full-width punctuation is CJK too: no space after 「。」.
    expect(mergeTranscript('好的。', 'Next')).toBe('好的。Next')
  })

  it('accumulates several finals', () => {
    let committed = ''
    for (const final of ['第一句。', '第二句。', 'third one']) {
      committed = mergeTranscript(committed, final)
    }
    expect(committed).toBe('第一句。第二句。third one')
  })

  it('ignores an empty or blank incoming text', () => {
    expect(mergeTranscript('kept', '')).toBe('kept')
    expect(mergeTranscript('kept', '   ')).toBe('kept')
    expect(mergeTranscript('', '  new ')).toBe('new')
  })
})

describe('spliceDictation', () => {
  it('inserts at the caret and puts the caret after the words', () => {
    expect(spliceDictation({ before: '请帮我', after: '，谢谢', spoken: '订一张票' })).toEqual({
      text: '请帮我订一张票，谢谢',
      caret: 7
    })
  })

  it('replaces the selection, as typing would', () => {
    // `before` / `after` are the draft around the selection, which is simply not carried.
    const draft = 'Call Alice tomorrow'
    const start = draft.indexOf('Alice')
    const end = start + 'Alice'.length
    const { text } = spliceDictation({
      before: draft.slice(0, start),
      after: draft.slice(end),
      spoken: 'Bob'
    })
    expect(text).toBe('Call Bob tomorrow')
  })

  it('adds a space between Latin words on either side, none next to CJK or existing spaces', () => {
    expect(spliceDictation({ before: 'Hello', after: 'again', spoken: 'world' })).toEqual({
      text: 'Hello world again',
      caret: 11
    })
    expect(spliceDictation({ before: 'Hello ', after: '', spoken: 'world' }).text).toBe(
      'Hello world'
    )
    expect(spliceDictation({ before: '你好', after: '吗', spoken: 'Tuff' }).text).toBe('你好Tuff吗')
  })

  it('writes into an empty draft', () => {
    expect(spliceDictation({ before: '', after: '', spoken: '  spoken  ' })).toEqual({
      text: 'spoken',
      caret: 6
    })
  })

  it('leaves the draft as it was when nothing has been said', () => {
    expect(spliceDictation({ before: 'a', after: 'b', spoken: '' })).toEqual({
      text: 'ab',
      caret: 1
    })
  })
})
