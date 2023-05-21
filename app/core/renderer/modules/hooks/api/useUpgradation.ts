import {wrapperAxios} from "~/base/axios";
const { get } = wrapperAxios('https://api.github.com/repos/talex-touch/talex-touch');

export function getReleases() {
    return get('/releases')
}

export interface GithubAuthor {
    login:               string;
    id:                  number;
    node_id:             string;
    avatar_url:          string;
    gravatar_id:         string;
    url:                 string;
    html_url:            string;
    followers_url:       string;
    following_url:       string;
    gists_url:           string;
    starred_url:         string;
    subscriptions_url:   string;
    organizations_url:   string;
    repos_url:           string;
    events_url:          string;
    received_events_url: string;
    type:                string;
    site_admin:          boolean;
}

export const enum AppPreviewChannel {
    MASTER = 'MASTER',
    SNAPSHOT = 'SNAPSHOT'
}

export interface GitHubRelease {
    url:              string;
    assets_url:       string;
    upload_url:       string;
    html_url:         string;
    id:               number;
    author:           GithubAuthor;
    node_id:          string;
    tag_name:         string;
    target_commitish: string;
    name:             string;
    draft:            boolean;
    prerelease:       boolean;
    created_at:       Date;
    published_at:     Date;
    assets:           any[];
    tarball_url:      string;
    zipball_url:      string;
    body:             string;
}

export interface AppVersion {
    channel: AppPreviewChannel,
    major: number,
    minor: number,
    patch: number
}

export class AppUpgradation {
    private static instance: AppUpgradation;

    version: AppVersion

    private constructor() {

        const pkg = window.$nodeApi.getPackageJSON()

        this.version = this._versionResolver(pkg.version)

    }

    _versionResolver(versionStr): AppVersion {
        // 1.0.0-SNAPSHOT
        const versionArr = versionStr.split('-')
        const version = versionArr[0]
        const channel = versionArr.length === 2 ? versionArr[1] || AppPreviewChannel.MASTER : AppPreviewChannel.MASTER

        const versionNumArr = version.split('.')

        return {
            channel: channel as AppPreviewChannel,
            major: parseInt(versionNumArr[0]),
            minor: parseInt(versionNumArr[1]),
            patch: parseInt(versionNumArr[2])
        }
    }

    _versionCompare(v1: AppVersion, v2: AppVersion) {
        // prioritize: channel > major > minor > patch
        // channel: MASTER < SNAPSHOT
        if (v1.channel !== v2.channel) {
            return v1.channel > v2.channel
        }

        return v1.major >= v2.major && v1.minor >= v2.minor && v1.patch > v2.patch
    }

    public static getInstance() {
        if (!AppUpgradation.instance) {
            AppUpgradation.instance = new AppUpgradation();
        }

        return AppUpgradation.instance;
    }

    public needUpdate(version: AppVersion) {
        return this._versionCompare(version, this.version)
    }

    public async check() {
        const latestRelease = await this.getLatestRelease();

        const newVersion = this._versionResolver(`${latestRelease.name}`)

        if ( this.needUpdate(newVersion) ) return latestRelease
        else return null
    }

    public async getLatestRelease(tagName = AppPreviewChannel.MASTER): Promise<GitHubRelease | undefined> {
        const releases: any = await getReleases()
        const filteredReleases = releases.filter(
            (release) => !release.prerelease && release.target_commitish.toUpperCase() === tagName
        );

        if (filteredReleases.length === 0) {
            console.log(`No ${tagName} releases found!`);
            return undefined;
        }

        return filteredReleases.reduce((a, b) =>
            new Date(a.published_at) > new Date(b.published_at) ? a : b
        );
    }

    public async download() {

    }
}