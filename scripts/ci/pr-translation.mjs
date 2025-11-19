#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { env, exit } from 'node:process'

const eventPath = process.argv[2]
if (!eventPath) {
  console.error('Usage: node scripts/ci/pr-translation.mjs <event-path>')
  exit(1)
}

const eventRaw = await readFile(eventPath, 'utf8')
const event = JSON.parse(eventRaw)
const pr = event.pull_request

if (!pr) {
  console.log('No pull_request payload detected, skip translation.')
  exit(0)
}

if (pr.draft) {
  console.log('Pull request is draft, skip translation.')
  exit(0)
}

const prBody = pr.body ?? ''
const sanitizedBody = prBody
  .replace(/<!--([\s\S]*?)-->/g, '')
  .replace(/\r/g, '')
  .trim()

if (!sanitizedBody) {
  console.log('Pull request body is empty, skip translation.')
  exit(0)
}

function detectLanguage(text) {
  const chineseMatches = text.match(/[\u4E00-\u9FFF]/g) ?? []
  const latinMatches = text.match(/[A-Z]/gi) ?? []

  const chineseCount = chineseMatches.length
  const latinCount = latinMatches.length

  if (chineseCount === 0 && latinCount === 0) {
    return 'unknown'
  }

  // Require a noticeable margin to avoid flipping on mixed content.
  if (chineseCount > latinCount * 1.2) {
    return 'zh'
  }

  if (latinCount > chineseCount * 1.2) {
    return 'en'
  }

  return 'mixed'
}

const detectedLanguage = detectLanguage(sanitizedBody)

if (detectedLanguage === 'mixed' || detectedLanguage === 'unknown') {
  console.log(`Detected language is ${detectedLanguage}, skip automatic translation.`)
  exit(0)
}

const translationTarget = detectedLanguage === 'zh' ? 'en' : 'zh'

const repository = env.GITHUB_REPOSITORY
if (!repository) {
  console.error('Missing GITHUB_REPOSITORY in environment.')
  exit(1)
}

const [owner, repo] = repository.split('/')
const githubToken = env.GITHUB_TOKEN
if (!githubToken) {
  console.error('Missing GITHUB_TOKEN, cannot access GitHub API.')
  exit(1)
}

const openaiKey = env.OPENAI_API_KEY || env.AI_REVIEW_API_KEY
if (!openaiKey) {
  console.log('No OpenAI-compatible API key configured, skip translation.')
  exit(0)
}

const baseUrlRaw = env.OPENAI_BASE_URL || env.AI_REVIEW_API_BASE || 'https://api.openai.com/v1'
const openaiBaseUrl = baseUrlRaw.replace(/\/$/, '')
const completionsPathRaw = env.OPENAI_COMPLETIONS_PATH || env.AI_REVIEW_COMPLETIONS_PATH || '/chat/completions'
const completionsPath = completionsPathRaw.startsWith('/') ? completionsPathRaw : `/${completionsPathRaw}`
const model = env.PR_TRANSLATION_MODEL || env.AI_REVIEW_MODEL || 'gpt-4o-mini'
const temperature = Number.parseFloat(env.PR_TRANSLATION_TEMPERATURE ?? env.AI_REVIEW_TEMPERATURE ?? '0.2')
const maxTokens = env.PR_TRANSLATION_MAX_OUTPUT_TOKENS
  ? Number.parseInt(env.PR_TRANSLATION_MAX_OUTPUT_TOKENS, 10)
  : env.AI_REVIEW_MAX_OUTPUT_TOKENS
    ? Number.parseInt(env.AI_REVIEW_MAX_OUTPUT_TOKENS, 10)
    : undefined

async function githubRequest(endpoint, init = {}) {
  const url = new URL(endpoint, 'https://api.github.com')
  const headers = {
    'Authorization': `token ${githubToken}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'tuff-pr-translation-bot',
    ...(init.headers ?? {}),
  }

  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GitHub API request failed (${response.status}): ${text}`)
  }

  return response
}

async function listIssueComments() {
  const comments = []
  let page = 1

  while (true) {
    const response = await githubRequest(`/repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=100&page=${page}`)
    const chunk = await response.json()
    comments.push(...chunk)

    if (chunk.length < 100) {
      break
    }

    page += 1
  }

  return comments
}

async function createOrUpdateComment(body) {
  const existingComments = await listIssueComments()
  const header = '### 🌐 PR 内容翻译'
  const targetComment = existingComments.find(comment => comment.body?.startsWith(header))

  if (targetComment) {
    if (targetComment.body === body) {
      console.log('Translation comment already up to date.')
      return
    }

    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${targetComment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    })
    console.log('Updated existing translation comment.')
    return
  }

  await githubRequest(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
  console.log('Created new translation comment.')
}

function languageName(code) {
  switch (code) {
    case 'zh':
      return '中文'
    case 'en':
      return 'English'
    default:
      return code
  }
}

async function requestTranslation() {
  const payload = {
    model,
    temperature,
    messages: [
      {
        role: 'system',
        content: 'You are a professional translator. Produce faithful, fluent translations without adding explanations.',
      },
      {
        role: 'user',
        content: [
          `Source language: ${detectedLanguage}`,
          `Target language: ${translationTarget}`,
          'Content to translate (Markdown):',
          '```markdown',
          sanitizedBody,
          '```',
          'Return only the translated Markdown content. Do not wrap it in code fences.',
        ].join('\n'),
      },
    ],
  }

  if (Number.isFinite(maxTokens)) {
    payload.max_tokens = maxTokens
  }

  const response = await fetch(`${openaiBaseUrl}${completionsPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Translation request failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  const choice = data.choices?.[0]?.message?.content

  if (!choice) {
    throw new Error('Missing translation result from API response.')
  }

  return choice.trim()
}

const translated = await requestTranslation()

const commentBody = [
  '### 🌐 PR 内容翻译',
  '',
  `源语言：${languageName(detectedLanguage)}`,
  `目标语言：${languageName(translationTarget)}`,
  '',
  translated,
  '',
  '> 🤖 如果需要重新翻译，请更新 PR 描述后重新运行该工作流或手动删除此评论。',
].join('\n')

await createOrUpdateComment(commentBody)

console.log('Translation completed successfully.')
