import type { MarketInstallInstruction, MarketPlugin, MarketProviderListOptions } from '@talex-touch/utils/market'
import { BaseMarketProvider } from './base-provider'

/**
 * Repository type detection
 */
type RepoType = 'github' | 'gitee' | 'unknown'

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
  name: string
  version?: string
  description?: string
  author?: string
  icon?: string
  homepage?: string
  category?: string
  tags?: string[]
}

/**
 * Repository Provider for GitHub/Gitee
 *
 * Supports fetching plugin releases from:
 * - GitHub repositories
 * - Gitee repositories
 *
 * URL formats:
 * - https://github.com/owner/repo
 * - https://gitee.com/owner/repo
 * - owner/repo (defaults to GitHub)
 */
export class RepositoryProvider extends BaseMarketProvider {
  private repoType: RepoType = 'unknown'
  private owner = ''
  private repo = ''

  /**
   * List plugins from repository releases
   */
  async list(_options: MarketProviderListOptions = {}): Promise<MarketPlugin[]> {
    const url = this.definition.url
    if (!url) {
      console.warn(`[RepositoryProvider] No URL configured for "${this.definition.name}"`)
      return []
    }

    this.parseRepoUrl(url)

    if (this.repoType === 'unknown') {
      console.warn(`[RepositoryProvider] Unknown repository type for URL: ${url}`)
      return []
    }

    try {
      // Try to fetch manifest first
      const manifest = await this.fetchManifest()

      // Then fetch releases
      const releases = await this.fetchReleases()

      if (releases.length === 0) {
        console.warn(`[RepositoryProvider] No releases found for ${this.owner}/${this.repo}`)
        return []
      }

      // Convert releases to MarketPlugin
      return this.convertReleasesToPlugins(releases, manifest)
    } catch (error) {
      console.error(`[RepositoryProvider] Failed to fetch from ${this.owner}/${this.repo}:`, error)
      return []
    }
  }

  /**
   * Parse repository URL to extract owner, repo, and type
   */
  private parseRepoUrl(url: string): void {
    // GitHub URL: https://github.com/owner/repo
    const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/i)
    if (githubMatch) {
      this.repoType = 'github'
      this.owner = githubMatch[1]
      this.repo = githubMatch[2].replace(/\.git$/, '')
      return
    }

    // Gitee URL: https://gitee.com/owner/repo
    const giteeMatch = url.match(/gitee\.com\/([^/]+)\/([^/]+)/i)
    if (giteeMatch) {
      this.repoType = 'gitee'
      this.owner = giteeMatch[1]
      this.repo = giteeMatch[2].replace(/\.git$/, '')
      return
    }

    // Short format: owner/repo (default to GitHub)
    const shortMatch = url.match(/^([^/]+)\/([^/]+)$/)
    if (shortMatch) {
      this.repoType = 'github'
      this.owner = shortMatch[1]
      this.repo = shortMatch[2]
      return
    }

    this.repoType = 'unknown'
  }

  /**
   * Fetch manifest.json from repository
   */
  private async fetchManifest(): Promise<PluginManifest | null> {
    try {
      const rawUrl = this.getRawContentUrl('manifest.json')
      const response = await this.request<PluginManifest>({
        url: rawUrl,
        method: 'GET',
        timeout: 10000
      })

      if (response.status === 200 && response.data) {
        return response.data
      }
    } catch {
      // Manifest is optional
    }
    return null
  }

  /**
   * Fetch releases from repository
   */
  private async fetchReleases(): Promise<GitHubRelease[]> {
    const apiUrl = this.getReleasesApiUrl()

    const response = await this.request<GitHubRelease[] | GiteeRelease[]>({
      url: apiUrl,
      method: 'GET',
      headers: this.getApiHeaders(),
      timeout: 15000
    })

    if (response.status !== 200) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`)
    }

    // Normalize Gitee response to GitHub format
    if (this.repoType === 'gitee') {
      return (response.data as GiteeRelease[]).map(r => ({
        tag_name: r.tag_name,
        name: r.name,
        body: r.body,
        published_at: r.created_at,
        assets: r.assets.map(a => ({
          name: a.name,
          browser_download_url: a.browser_download_url,
          size: 0,
          content_type: 'application/octet-stream'
        })),
        html_url: `https://gitee.com/${this.owner}/${this.repo}/releases/tag/${r.tag_name}`,
        prerelease: false,
        draft: false
      }))
    }

    return response.data as GitHubRelease[]
  }

  /**
   * Get API URL for releases
   */
  private getReleasesApiUrl(): string {
    if (this.repoType === 'github') {
      return `https://api.github.com/repos/${this.owner}/${this.repo}/releases`
    }
    return `https://gitee.com/api/v5/repos/${this.owner}/${this.repo}/releases`
  }

  /**
   * Get raw content URL for a file
   */
  private getRawContentUrl(filePath: string): string {
    if (this.repoType === 'github') {
      return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/main/${filePath}`
    }
    return `https://gitee.com/${this.owner}/${this.repo}/raw/main/${filePath}`
  }

  /**
   * Get API headers
   */
  private getApiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    }

    // GitHub API token from config
    const token = this.definition.config?.token as string | undefined
    if (token && this.repoType === 'github') {
      headers.Authorization = `Bearer ${token}`
    }

    return headers
  }

  /**
   * Convert releases to MarketPlugin format
   */
  private convertReleasesToPlugins(
    releases: GitHubRelease[],
    manifest: PluginManifest | null
  ): MarketPlugin[] {
    // Filter out prereleases and drafts, get latest stable
    const stableReleases = releases.filter(r => !r.prerelease && !r.draft)
    const latestRelease = stableReleases[0] || releases[0]

    if (!latestRelease) {
      return []
    }

    // Find downloadable asset
    const asset = this.findPluginAsset(latestRelease.assets)

    // Build install instruction
    let install: MarketInstallInstruction | undefined

    if (asset) {
      install = {
        type: 'url',
        url: asset.browser_download_url,
        format: this.detectFormat(asset.name)
      }
    } else {
      // Fallback to git clone
      install = {
        type: 'git',
        repo: `https://${this.repoType === 'github' ? 'github.com' : 'gitee.com'}/${this.owner}/${this.repo}`,
        ref: latestRelease.tag_name
      }
    }

    const pluginId = `${this.repoType}:${this.owner}/${this.repo}`
    const pluginName = manifest?.name || this.repo

    const plugin: MarketPlugin = {
      id: pluginId,
      name: pluginName,
      version: latestRelease.tag_name.replace(/^v/, ''),
      description: manifest?.description || latestRelease.body?.slice(0, 200) || '',
      category: manifest?.category || 'community',
      tags: manifest?.tags || [],
      author: manifest?.author || this.owner,
      icon: manifest?.icon,
      homepage: manifest?.homepage || latestRelease.html_url,
      downloadUrl: asset?.browser_download_url,
      install,
      providerId: this.definition.id,
      providerName: this.definition.name,
      providerType: 'repository',
      providerTrustLevel: this.trustLevel,
      trusted: this.isTrusted,
      timestamp: latestRelease.published_at
    }

    return [plugin]
  }

  /**
   * Find plugin asset from release assets
   */
  private findPluginAsset(assets: GitHubAsset[]): GitHubAsset | undefined {
    // Priority: .tpex > .zip > .tar.gz > .tgz
    const priorities = ['.tpex', '.zip', '.tar.gz', '.tgz']

    for (const ext of priorities) {
      const asset = assets.find(a => a.name.toLowerCase().endsWith(ext))
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
