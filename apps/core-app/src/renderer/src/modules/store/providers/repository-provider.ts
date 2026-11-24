import type {
  StoreInstallInstruction,
  StorePlugin,
  StoreProviderListOptions
} from '@talex-touch/utils/store'
import { DEFAULT_STORE_DISCOVERY_KEYWORDS } from '@talex-touch/utils/store'
import { createRendererLogger } from '~/utils/renderer-log'
import { BaseStoreProvider } from './base-provider'
import { normalizeStoreIcon } from './store-icon-normalizer'

const repositoryProviderLog = createRendererLogger('RepositoryProvider')
const DEFAULT_GITHUB_API_BASE = 'https://api.github.com'
const DEFAULT_GITEE_API_BASE = 'https://gitee.com/api/v5'
const MAX_DISCOVERY_REPOS = 12
const REPO_ENRICH_CONCURRENCY = 4

/**
 * Repository type detection
 */
type RepoType = 'github' | 'gitee' | 'unknown'

type RepositoryTarget =
  | { kind: 'single'; repoType: 'github' | 'gitee'; owner: string; repo: string }
  | { kind: 'github-search'; topics: string[]; query?: string }
  | { kind: 'github-owner'; owner: string; topics: string[] }
  | { kind: 'unknown' }

/**
 * GitHub release asset
 */
interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
  content_type: string
}

/**
 * GitHub release
 */
interface GitHubRelease {
  tag_name: string
  name: string
  body?: string
  published_at: string
  assets: GitHubAsset[]
  html_url: string
  prerelease: boolean
  draft: boolean
}

interface GitHubSearchRepo {
  name: string
  full_name: string
  description?: string | null
  html_url: string
  homepage?: string | null
  default_branch?: string
  archived?: boolean
  topics?: string[]
  stargazers_count?: number
  pushed_at?: string
  updated_at?: string
  owner: {
    login: string
  }
}

interface GitHubSearchReposResponse {
  total_count: number
  items: GitHubSearchRepo[]
}

/**
 * Gitee release (similar structure)
 */
interface GiteeRelease {
  tag_name: string
  name: string
  body?: string
  created_at: string
  assets: Array<{
    name: string
    browser_download_url: string
  }>
}

/**
 * Plugin manifest from repository
 */
interface PluginManifest {
  id?: string
  name: string
  version?: string
  description?: string
  author?: string
  icon?: unknown
  homepage?: string
  category?: string
  tags?: string[]
  sdkapi?: number
}

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.message === 'STORE_GITHUB_RATE_LIMITED' ||
    error.message.includes('STORE_HTTP_STATUS_403') ||
    error.message.includes('STORE_HTTP_STATUS_429')
  )
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      results[currentIndex] = await mapper(items[currentIndex]!)
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

/**
 * Repository Provider for GitHub/Gitee
 *
 * Supports fetching plugins from:
 * - GitHub topic discovery channels (e.g. https://github.com/topics/tuff-plugin)
 * - GitHub org/user channels (e.g. https://github.com/talex-touch)
 * - Single GitHub repositories (https://github.com/owner/repo or owner/repo)
 * - Single Gitee repositories (https://gitee.com/owner/repo)
 */
export class RepositoryProvider extends BaseStoreProvider {
  #cache: StorePlugin[] | null = null

  /**
   * List plugins from repository discovery or single repository releases
   */
  async list(options: StoreProviderListOptions = {}): Promise<StorePlugin[]> {
    const hasSearchOverride = Boolean(options.keyword?.trim())
    if (!options.force && !hasSearchOverride && this.#cache) {
      return this.#cache
    }

    const target = this.resolveTarget(options.keyword)

    if (target.kind === 'unknown') {
      repositoryProviderLog.warn(
        `Unsupported repository target for "${this.definition.name}": ${this.definition.url ?? ''}`
      )
      throw new TypeError('STORE_HTTP_INVALID_URL')
    }

    let plugins: StorePlugin[]
    if (target.kind === 'single') {
      plugins = await this.listSingleRepository(target.repoType, target.owner, target.repo)
    } else if (target.kind === 'github-owner') {
      plugins = await this.listGitHubOwner(target.owner, target.topics)
    } else {
      plugins = await this.listGitHubSearch(target.topics, target.query)
    }

    if (!hasSearchOverride) {
      this.#cache = plugins
    }

    return plugins
  }

  private resolveConfiguredTopics(primaryTopic?: string): string[] {
    const topics: string[] = []
    if (primaryTopic && primaryTopic.trim().length > 0) {
      topics.push(primaryTopic.trim())
    }

    const configTopics = this.definition.config?.topics
    if (Array.isArray(configTopics)) {
      for (const topic of configTopics) {
        if (typeof topic === 'string' && topic.trim().length > 0) {
          topics.push(topic.trim())
        }
      }
    }

    const configTopic = this.definition.config?.topic
    if (typeof configTopic === 'string' && configTopic.trim().length > 0) {
      topics.push(configTopic.trim())
    }

    if (topics.length === 0) {
      return [...DEFAULT_STORE_DISCOVERY_KEYWORDS]
    }

    return Array.from(new Set(topics))
  }

  private resolveTarget(optionKeyword?: string): RepositoryTarget {
    const rawUrl = typeof this.definition.url === 'string' ? this.definition.url.trim() : ''
    const configMode =
      typeof this.definition.config?.mode === 'string' ? this.definition.config.mode.trim() : ''
    const configQuery =
      typeof this.definition.config?.query === 'string' ? this.definition.config.query.trim() : ''

    if (!rawUrl) {
      if (configMode === 'search' || this.definition.config?.platform === 'github') {
        return {
          kind: 'github-search',
          topics: this.resolveConfiguredTopics(optionKeyword),
          query: configQuery || undefined
        }
      }
      return { kind: 'unknown' }
    }

    // Short format: owner/repo (default to GitHub)
    const shortMatch = rawUrl.match(/^([\w.-]+)\/([\w.-]+)$/)
    if (shortMatch) {
      return {
        kind: 'single',
        repoType: 'github',
        owner: shortMatch[1]!,
        repo: shortMatch[2]!.replace(/\.git$/, '')
      }
    }

    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      return { kind: 'unknown' }
    }

    const host = parsed.hostname.toLowerCase()
    const segments = parsed.pathname.split('/').filter(Boolean)

    if (host === 'api.github.com') {
      return {
        kind: 'github-search',
        topics: this.resolveConfiguredTopics(optionKeyword),
        query: configQuery || undefined
      }
    }

    if (host === 'github.com' || host === 'www.github.com') {
      if (segments.length === 0) {
        return {
          kind: 'github-search',
          topics: this.resolveConfiguredTopics(optionKeyword),
          query: configQuery || undefined
        }
      }

      if (segments[0]?.toLowerCase() === 'topics') {
        const urlTopic = segments[1] ? decodeURIComponent(segments[1]) : undefined
        return {
          kind: 'github-search',
          topics: this.resolveConfiguredTopics(optionKeyword || urlTopic),
          query: configQuery || undefined
        }
      }

      if (segments.length === 1) {
        const owner = segments[0]!
        if (owner.toLowerCase() === 'search') {
          const queryParam = parsed.searchParams.get('q')?.trim()
          return {
            kind: 'github-search',
            topics: this.resolveConfiguredTopics(optionKeyword),
            query: queryParam || configQuery || undefined
          }
        }
        return {
          kind: 'github-owner',
          owner,
          topics: this.resolveConfiguredTopics(optionKeyword)
        }
      }

      if (segments[0]?.toLowerCase() === 'orgs' && segments[1]) {
        return {
          kind: 'github-owner',
          owner: segments[1],
          topics: this.resolveConfiguredTopics(optionKeyword)
        }
      }

      return {
        kind: 'single',
        repoType: 'github',
        owner: segments[0]!,
        repo: segments[1]!.replace(/\.git$/, '')
      }
    }

    if (host === 'gitee.com' || host === 'www.gitee.com') {
      if (segments.length >= 2) {
        return {
          kind: 'single',
          repoType: 'gitee',
          owner: segments[0]!,
          repo: segments[1]!.replace(/\.git$/, '')
        }
      }
    }

    return { kind: 'unknown' }
  }

  private getApiBase(repoType: 'github' | 'gitee'): string {
    const configured =
      typeof this.definition.config?.apiBase === 'string'
        ? this.definition.config.apiBase.trim().replace(/\/+$/, '')
        : ''
    if (configured) {
      return configured
    }
    return repoType === 'github' ? DEFAULT_GITHUB_API_BASE : DEFAULT_GITEE_API_BASE
  }

  private async listGitHubSearch(topics: string[], explicitQuery?: string): Promise<StorePlugin[]> {
    const queries = explicitQuery
      ? [explicitQuery]
      : topics.map((topic) => `topic:${topic} archived:false`)

    const settled = await Promise.allSettled(
      queries.map((query) => this.searchGitHubRepositories(query))
    )

    const merged = new Map<string, GitHubSearchRepo>()
    let succeededCount = 0
    let firstError: unknown = null

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        succeededCount += 1
        for (const repo of result.value) {
          if (!repo.archived && !merged.has(repo.full_name)) {
            merged.set(repo.full_name, repo)
          }
        }
      } else if (!firstError) {
        firstError = result.reason
      }
    }

    if (succeededCount === 0 && firstError) {
      repositoryProviderLog.error('GitHub repository search failed:', firstError)
      throw firstError
    }

    const candidates = Array.from(merged.values())
      .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
      .slice(0, MAX_DISCOVERY_REPOS)

    return this.enrichGitHubRepos(candidates)
  }

  private async listGitHubOwner(owner: string, topics: string[]): Promise<StorePlugin[]> {
    const queries = topics.map((topic) => `user:${owner} topic:${topic} archived:false`)
    const settled = await Promise.allSettled(
      queries.map((query) => this.searchGitHubRepositories(query))
    )

    const merged = new Map<string, GitHubSearchRepo>()
    let succeededCount = 0
    let firstError: unknown = null

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        succeededCount += 1
        for (const repo of result.value) {
          if (!repo.archived && !merged.has(repo.full_name)) {
            merged.set(repo.full_name, repo)
          }
        }
      } else if (!firstError) {
        firstError = result.reason
      }
    }

    if (succeededCount === 0 && firstError) {
      throw firstError
    }

    const candidates = Array.from(merged.values()).slice(0, MAX_DISCOVERY_REPOS)
    return this.enrichGitHubRepos(candidates)
  }

  private async searchGitHubRepositories(query: string): Promise<GitHubSearchRepo[]> {
    const apiBase = this.getApiBase('github')
    const url = `${apiBase}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20`

    let response: Awaited<ReturnType<typeof this.request<GitHubSearchReposResponse>>>
    try {
      response = await this.request<GitHubSearchReposResponse>({
        url,
        method: 'GET',
        headers: this.getApiHeaders('github'),
        timeout: 15000
      })
    } catch (error) {
      if (isRateLimitError(error)) {
        throw new Error('STORE_GITHUB_RATE_LIMITED')
      }
      throw error
    }

    if (response.status === 403 || response.status === 429) {
      throw new Error('STORE_GITHUB_RATE_LIMITED')
    }

    if (response.status !== 200) {
      throw new Error(`STORE_HTTP_STATUS_${response.status}`)
    }

    return Array.isArray(response.data?.items) ? response.data.items : []
  }

  private async enrichGitHubRepos(repos: GitHubSearchRepo[]): Promise<StorePlugin[]> {
    let releaseLookupRateLimited = false

    const plugins = await mapWithConcurrency(
      repos,
      REPO_ENRICH_CONCURRENCY,
      async (repo): Promise<StorePlugin> => {
        const owner = repo.owner.login
        const repoName = repo.name
        const branch = repo.default_branch || 'main'

        const manifest = await this.fetchManifest('github', owner, repoName, branch)
        let latestRelease: GitHubRelease | null = null

        if (!releaseLookupRateLimited) {
          try {
            latestRelease = await this.fetchLatestGitHubRelease(owner, repoName)
          } catch (error) {
            if (isRateLimitError(error)) {
              releaseLookupRateLimited = true
            }
          }
        }

        return this.buildPluginFromRepo({
          repoType: 'github',
          owner,
          repo: repoName,
          branch,
          repoMeta: repo,
          manifest,
          latestRelease
        })
      }
    )

    return plugins
  }

  private async listSingleRepository(
    repoType: 'github' | 'gitee',
    owner: string,
    repo: string
  ): Promise<StorePlugin[]> {
    const manifest =
      (await this.fetchManifest(repoType, owner, repo, 'main')) ??
      (await this.fetchManifest(repoType, owner, repo, 'master'))

    const releases = await this.fetchReleases(repoType, owner, repo)
    const stableReleases = releases.filter((r) => !r.prerelease && !r.draft)
    const latestRelease = stableReleases[0] || releases[0] || null

    if (!latestRelease && !manifest) {
      repositoryProviderLog.warn(`No releases or manifest found for ${owner}/${repo}`)
      return []
    }

    return [
      this.buildPluginFromRepo({
        repoType,
        owner,
        repo,
        branch: 'main',
        manifest,
        latestRelease
      })
    ]
  }

  /**
   * Fetch manifest.json from repository raw CDN (does not consume GitHub REST API quota)
   */
  private async fetchManifest(
    repoType: RepoType,
    owner: string,
    repo: string,
    branch = 'main'
  ): Promise<PluginManifest | null> {
    if (repoType === 'unknown') return null
    try {
      const rawUrl = this.getRawContentUrl(repoType, owner, repo, branch, 'manifest.json')
      const response = await this.request<PluginManifest>({
        url: rawUrl,
        method: 'GET',
        timeout: 10000
      })

      if (response.status === 200 && response.data && typeof response.data === 'object') {
        return response.data
      }
    } catch {
      // Manifest is optional
    }
    return null
  }

  private async fetchLatestGitHubRelease(
    owner: string,
    repo: string
  ): Promise<GitHubRelease | null> {
    const apiUrl = `${this.getApiBase('github')}/repos/${owner}/${repo}/releases/latest`
    const response = await this.request<GitHubRelease>({
      url: apiUrl,
      method: 'GET',
      headers: this.getApiHeaders('github'),
      timeout: 10000
    })

    if (response.status === 403 || response.status === 429) {
      throw new Error('STORE_GITHUB_RATE_LIMITED')
    }

    if (response.status !== 200 || !response.data) {
      return null
    }

    return response.data
  }

  /**
   * Fetch releases from repository
   */
  private async fetchReleases(
    repoType: 'github' | 'gitee',
    owner: string,
    repo: string
  ): Promise<GitHubRelease[]> {
    const apiUrl = this.getReleasesApiUrl(repoType, owner, repo)

    let response: Awaited<ReturnType<typeof this.request<GitHubRelease[] | GiteeRelease[]>>>
    try {
      response = await this.request<GitHubRelease[] | GiteeRelease[]>({
        url: apiUrl,
        method: 'GET',
        headers: this.getApiHeaders(repoType),
        timeout: 15000
      })
    } catch (error) {
      if (repoType === 'github' && isRateLimitError(error)) {
        throw new Error('STORE_GITHUB_RATE_LIMITED')
      }
      throw error
    }

    if (repoType === 'github' && (response.status === 403 || response.status === 429)) {
      throw new Error('STORE_GITHUB_RATE_LIMITED')
    }

    if (response.status !== 200) {
      throw new Error(`STORE_HTTP_STATUS_${response.status}`)
    }

    // Normalize Gitee response to GitHub format
    if (repoType === 'gitee') {
      const list = Array.isArray(response.data) ? (response.data as GiteeRelease[]) : []
      return list.map((r) => ({
        tag_name: r.tag_name,
        name: r.name,
        body: r.body,
        published_at: r.created_at,
        assets: (r.assets ?? []).map((a) => ({
          name: a.name,
          browser_download_url: a.browser_download_url,
          size: 0,
          content_type: 'application/octet-stream'
        })),
        html_url: `https://gitee.com/${owner}/${repo}/releases/tag/${r.tag_name}`,
        prerelease: false,
        draft: false
      }))
    }

    return Array.isArray(response.data) ? (response.data as GitHubRelease[]) : []
  }

  /**
   * Get API URL for releases
   */
  private getReleasesApiUrl(repoType: 'github' | 'gitee', owner: string, repo: string): string {
    return `${this.getApiBase(repoType)}/repos/${owner}/${repo}/releases`
  }

  /**
   * Get raw content URL for a file
   */
  private getRawContentUrl(
    repoType: 'github' | 'gitee',
    owner: string,
    repo: string,
    branch: string,
    filePath: string
  ): string {
    if (repoType === 'github') {
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
    }
    return `https://gitee.com/${owner}/${repo}/raw/${branch}/${filePath}`
  }

  /**
   * Get API headers
   */
  private getApiHeaders(repoType: 'github' | 'gitee'): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: repoType === 'github' ? 'application/vnd.github+json' : 'application/json'
    }

    if (repoType === 'github') {
      headers['User-Agent'] = 'Tuff-Store-Client'
    }

    return headers
  }

  private buildPluginFromRepo(params: {
    repoType: 'github' | 'gitee'
    owner: string
    repo: string
    branch: string
    repoMeta?: GitHubSearchRepo
    manifest: PluginManifest | null
    latestRelease: GitHubRelease | null
  }): StorePlugin {
    const { repoType, owner, repo, branch, repoMeta, manifest, latestRelease } = params
    const asset = latestRelease ? this.findPluginAsset(latestRelease.assets ?? []) : undefined
    const repoWebUrl =
      repoMeta?.html_url ||
      `https://${repoType === 'github' ? 'github.com' : 'gitee.com'}/${owner}/${repo}`

    let install: StoreInstallInstruction
    if (asset) {
      install = {
        type: 'url',
        url: asset.browser_download_url,
        format: this.detectFormat(asset.name)
      }
    } else {
      install = {
        type: 'git',
        repo: repoWebUrl,
        ref: latestRelease?.tag_name || branch
      }
    }

    const rawBaseUrl = this.getRawContentUrl(repoType, owner, repo, branch, '')
    const normalizedIcon = normalizeStoreIcon(manifest?.icon, rawBaseUrl)
    const pluginId = `${repoType}:${owner}/${repo}`
    const pluginName = manifest?.name || repo
    const version = latestRelease?.tag_name?.replace(/^v/i, '') || manifest?.version || branch
    const tags = Array.from(
      new Set([...(manifest?.tags ?? []), ...(repoMeta?.topics ?? [])].filter(Boolean))
    )

    return {
      id: pluginId,
      name: pluginName,
      version,
      description:
        manifest?.description || repoMeta?.description || latestRelease?.body?.slice(0, 200) || '',
      category: manifest?.category || 'utilities',
      tags,
      author: manifest?.author || owner,
      icon: normalizedIcon.icon,
      iconUrl: normalizedIcon.iconUrl,
      manifest:
        manifest && (manifest.id || manifest.name || typeof manifest.sdkapi === 'number')
          ? {
              ...(manifest.id ? { id: manifest.id } : {}),
              ...(manifest.name ? { name: manifest.name } : {}),
              ...(typeof manifest.sdkapi === 'number' ? { sdkapi: manifest.sdkapi } : {})
            }
          : undefined,
      readmeUrl: this.getRawContentUrl(repoType, owner, repo, branch, 'README.md'),
      homepage: manifest?.homepage || repoMeta?.homepage || latestRelease?.html_url || repoWebUrl,
      downloadUrl: asset?.browser_download_url,
      install,
      metadata: {
        repository: repoWebUrl,
        defaultBranch: branch,
        ...(typeof repoMeta?.stargazers_count === 'number'
          ? { stars: repoMeta.stargazers_count }
          : {})
      },
      providerId: this.definition.id,
      providerName: this.definition.name,
      providerType: 'repository',
      providerTrustLevel: this.trustLevel,
      trusted: this.isTrusted,
      timestamp: latestRelease?.published_at || repoMeta?.pushed_at || repoMeta?.updated_at
    }
  }

  /**
   * Find plugin asset from release assets
   */
  private findPluginAsset(assets: GitHubAsset[]): GitHubAsset | undefined {
    // Priority: .tpex > .zip > .tar.gz > .tgz
    const priorities = ['.tpex', '.zip', '.tar.gz', '.tgz']

    for (const ext of priorities) {
      const asset = assets.find((a) => a.name.toLowerCase().endsWith(ext))
      if (asset) return asset
    }

    return undefined
  }

  /**
   * Detect archive format from filename
   */
  private detectFormat(filename: string): 'zip' | 'tar' | 'tgz' | 'tpex' {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.tpex')) return 'tpex'
    if (lower.endsWith('.zip')) return 'zip'
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tgz'
    return 'zip'
  }
}
