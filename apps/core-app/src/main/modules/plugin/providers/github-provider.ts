import path from 'path'
import {
  PluginProviderType,
  type PluginInstallRequest,
  type PluginInstallResult,
  type PluginProvider,
  type PluginProviderContext
} from '@talex-touch/utils/plugin/providers'
import { ensureRiskAccepted, downloadToTempFile } from './utils'

const OFFICIAL_GITHUB_OWNERS = ['talex-touch']
const DEFAULT_BRANCH = 'main'

interface ParsedGithubSource {
  owner: string
  repo: string
  ref?: string
  assetPath?: string
  directUrl?: string
}

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com'])
const RAW_HOSTS = new Set(['raw.githubusercontent.com'])

function parseGithubSource(source: string): ParsedGithubSource | undefined {
  const trimmed = source.trim()

  if (/^[\w.-]+\/[\w.-]+(@[\w./-]+)?$/.test(trimmed)) {
    const [repoPart, refPart] = trimmed.split('@')
    const [owner, repo] = repoPart.split('/')
    return { owner, repo, ref: refPart }
  }

  if (!trimmed.startsWith('http')) return undefined

  let url: URL
  try {
    url = new URL(trimmed)
  } catch (error) {
    return undefined
  }

  if (RAW_HOSTS.has(url.hostname)) {
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 4) return undefined
    const [owner, repo, ref, ...pathSegments] = segments
    return {
      owner,
      repo,
      ref,
      directUrl: url.toString(),
      assetPath: pathSegments.join('/')
    }
  }

  if (!GITHUB_HOSTS.has(url.hostname)) return undefined

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 2) return undefined

  const [owner, repo, type, ...rest] = segments
  if (!type) {
    return { owner, repo }
  }

  if (type === 'releases' && rest[0] === 'download') {
    const [tag, ...assetSegments] = rest.slice(1)
    return {
      owner,
      repo,
      ref: tag,
      assetPath: assetSegments.join('/'),
      directUrl: url.toString()
    }
  }

  if (type === 'blob' && rest.length >= 2) {
    const [ref, ...assetSegments] = rest
    return {
      owner,
      repo,
      ref,
      assetPath: assetSegments.join('/')
    }
  }

  if (type === 'raw' && rest.length >= 2) {
    const [ref, ...assetSegments] = rest
    return {
      owner,
      repo,
      ref,
      assetPath: assetSegments.join('/'),
      directUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${assetSegments.join('/')}`
    }
  }

  if (type === 'tree' && rest.length >= 1) {
    const [ref] = rest
    return { owner, repo, ref }
  }

  if (type === 'archive') {
    return { owner, repo, directUrl: url.toString() }
  }

  return { owner, repo }
}

function resolveDownloadUrl(parsed: ParsedGithubSource): { url: string; extension: string } {
  if (parsed.directUrl) {
    return { url: parsed.directUrl, extension: path.extname(parsed.directUrl) || '.tar' }
  }

  if (parsed.assetPath) {
    const ref = parsed.ref || DEFAULT_BRANCH
    const url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${ref}/${parsed.assetPath}`
    const extension = path.extname(parsed.assetPath) || '.tar'
    return { url, extension }
  }

  const ref = parsed.ref || DEFAULT_BRANCH
  const url = `https://codeload.github.com/${parsed.owner}/${parsed.repo}/tar.gz/${ref}`
  return { url, extension: '.tar.gz' }
}

export class GithubPluginProvider implements PluginProvider {
  readonly type = PluginProviderType.GITHUB

  canHandle(request: PluginInstallRequest): boolean {
    return Boolean(parseGithubSource(request.source))
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    const parsed = parseGithubSource(request.source)
    if (!parsed) {
      throw new Error('无法解析的 GitHub 插件来源')
    }

    const isOfficial = OFFICIAL_GITHUB_OWNERS.includes(parsed.owner)
    if (!isOfficial) {
      await ensureRiskAccepted(
        this.type,
        request,
        context,
        'needs_confirmation',
        '即将下载来自自定义 GitHub 仓库的插件，存在潜在风险。',
        { owner: parsed.owner, repo: parsed.repo }
      )
    }

    const { url, extension } = resolveDownloadUrl(parsed)
    const filePath = await downloadToTempFile(url, extension)

    return {
      provider: this.type,
      official: isOfficial,
      filePath,
      metadata: {
        owner: parsed.owner,
        repo: parsed.repo,
        ref: parsed.ref,
        assetPath: parsed.assetPath,
        downloadUrl: url
      }
    }
  }
}
