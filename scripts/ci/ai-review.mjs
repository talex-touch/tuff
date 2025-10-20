#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { env, exit } from 'node:process';

const eventPath = process.argv[2];
if (!eventPath) {
  console.error('Usage: node scripts/ci/ai-review.mjs <event-path>');
  exit(1);
}

const eventRaw = await readFile(eventPath, 'utf8');
const event = JSON.parse(eventRaw);
const pr = event.pull_request;

if (!pr) {
  console.log('No pull_request payload detected, skip AI review.');
  exit(0);
}

if (pr.draft) {
  console.log('Pull request is draft, skip AI review.');
  exit(0);
}

const prBody = pr.body ?? '';
const aiRequested = /☑\s*需要触发 AI 对此 PR 的自动分析/.test(prBody);
if (!aiRequested) {
  console.log('AI review not requested in PR template, skip.');
  exit(0);
}

const allowedAssociationsEnv = env.AI_REVIEW_ALLOWED_ASSOCIATIONS;
const allowedAssociations = allowedAssociationsEnv
  ? allowedAssociationsEnv.split(',').map(token => token.trim()).filter(Boolean)
  : ['MEMBER', 'OWNER', 'COLLABORATOR'];

if (!allowedAssociations.includes('*') && !allowedAssociations.includes(pr.author_association)) {
  console.log(`Author association ${pr.author_association} not in allowed list, skip.`);
  exit(0);
}

const repository = env.GITHUB_REPOSITORY;
if (!repository) {
  console.error('Missing GITHUB_REPOSITORY in environment.');
  exit(1);
}

const [owner, repo] = repository.split('/');
const githubToken = env.GITHUB_TOKEN;
if (!githubToken) {
  console.error('Missing GITHUB_TOKEN, cannot access GitHub API.');
  exit(1);
}

const openaiKey = env.OPENAI_API_KEY;
if (!openaiKey) {
  console.log('OPENAI_API_KEY is not configured, skip AI review.');
  exit(0);
}

const baseUrlRaw = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const openaiBaseUrl = baseUrlRaw.replace(/\/$/, '');
const completionsPathRaw = env.OPENAI_COMPLETIONS_PATH || '/chat/completions';
const completionsPath = completionsPathRaw.startsWith('/') ? completionsPathRaw : `/${completionsPathRaw}`;
const model = env.AI_REVIEW_MODEL || 'gpt-4o-mini';
const temperature = Number.parseFloat(env.AI_REVIEW_TEMPERATURE ?? '0.2');
const maxTokens = env.AI_REVIEW_MAX_OUTPUT_TOKENS ? Number.parseInt(env.AI_REVIEW_MAX_OUTPUT_TOKENS, 10) : undefined;

const focusMatch = prBody.match(/期望的分析重点：([^\n]+)/);
const requestedFocus = focusMatch ? focusMatch[1].replace(/<!--.*?-->/g, '').trim() : '';

const sanitize = input => input
  .replace(/<!--([\s\S]*?)-->/g, '')
  .replace(/^[\t ]*[-*]\s*[☐☑]\s*/gm, '- ')
  .replace(/\r/g, '')
  .trim();

const sanitizedBody = sanitize(prBody);

async function githubRequest(endpoint, init = {}) {
  const url = new URL(endpoint, 'https://api.github.com');
  const headers = {
    'Authorization': `token ${githubToken}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'tuff-ai-review-bot',
    ...(init.headers ?? {}),
  };

  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${text}`);
  }

  return response;
}

async function listPullRequestFiles() {
  const files = [];
  let page = 1;

  while (true) {
    const response = await githubRequest(`/repos/${owner}/${repo}/pulls/${pr.number}/files?per_page=100&page=${page}`);
    const chunk = await response.json();
    files.push(...chunk);

    if (chunk.length < 100) {
      break;
    }

    page += 1;
  }

  return files;
}

async function listIssueComments() {
  const comments = [];
  let page = 1;

  while (true) {
    const response = await githubRequest(`/repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=100&page=${page}`);
    const chunk = await response.json();
    comments.push(...chunk);

    if (chunk.length < 100) {
      break;
    }

    page += 1;
  }

  return comments;
}

const files = await listPullRequestFiles();

const diffSummary = files.map(file => {
  const meta = [];
  if (file.status && file.status !== 'modified') meta.push(file.status);
  meta.push(`+${file.additions}/-${file.deletions}`);
  return `- ${file.filename} (${meta.join(', ')})`;
}).join('\n');

const patchSections = [];
let accumulated = 0;
const patchBudget = Number.parseInt(env.AI_REVIEW_PATCH_CHARACTER_LIMIT ?? '12000', 10);

for (const file of files) {
  if (!file.patch) continue;
  const remaining = patchBudget - accumulated;
  if (remaining <= 0) break;
  const slice = file.patch.slice(0, remaining);
  accumulated += slice.length;
  const truncated = slice.length < (file.patch?.length ?? 0);
  patchSections.push(`文件：${file.filename}\n${slice}${truncated ? '\n…（已截断）' : ''}`);
}

const detailedDiff = patchSections.join('\n\n');

function extractReleaseNotes(body) {
  const lines = body.split(/\r?\n/);
  const startIndex = lines.findIndex(line => /###\s*Release Notes/.test(line));
  if (startIndex === -1) return '';

  const collected = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    collected.push(line);
  }

  return sanitize(collected.join('\n'));
}

const releaseNotes = extractReleaseNotes(prBody);

const promptParts = [
  '请作为经验丰富的代码评审者，审阅以下 Pull Request 信息并给出总结、潜在风险与建议。',
  `仓库：${owner}/${repo}`,
  `PR 编号：#${pr.number}`,
  `标题：${pr.title}`,
  `作者：${pr.user?.login ?? 'unknown'}`,
  `基准分支：${pr.base?.ref}`,
  `来源分支：${pr.head?.ref}`,
];

if (requestedFocus) {
  promptParts.push(`作者特别希望关注：${requestedFocus}`);
}

promptParts.push('\n---\n');

if (sanitizedBody) {
  promptParts.push('PR 描述：');
  promptParts.push(sanitizedBody);
  promptParts.push('\n---\n');
}

if (releaseNotes) {
  promptParts.push('作者提供的 Release Notes：');
  promptParts.push(releaseNotes);
  promptParts.push('\n---\n');
}

if (diffSummary) {
  promptParts.push('文件变更概览：');
  promptParts.push(diffSummary);
}

if (detailedDiff) {
  promptParts.push('\n详细差异（已按总长度限制截断）：');
  promptParts.push(detailedDiff);
}

promptParts.push('\n请输出：\n1. 关键变更摘要\n2. 需要特别注意的风险或潜在问题\n3. 建议的测试或验证步骤\n如果信息不足以判断，请明确指出。');

const prompt = promptParts.join('\n');

async function requestAiReview() {
  const response = await fetch(`${openaiBaseUrl}${completionsPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        {
          role: 'system',
          content: '你是一名严谨的高级软件工程师，擅长代码评审与风险分析。请在提供建议时保持专业、简洁。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...(Number.isFinite(maxTokens) ? { max_tokens: maxTokens } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI provider request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message?.content?.trim();

  if (!message) {
    throw new Error('AI provider returned an empty response.');
  }

  return message;
}

const aiResult = await requestAiReview();

const comments = await listIssueComments();
const existing = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.includes('### 🤖 AI 评审结果'));

const commentBody = `### 🤖 AI 评审结果\n\n${aiResult}\n\n---\n_模型：${model} · 由自动化脚本生成_`;

if (existing) {
  await githubRequest(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: commentBody }),
  });
  console.log('Updated existing AI review comment.');
} else {
  await githubRequest(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: commentBody }),
  });
  console.log('Posted new AI review comment.');
}
