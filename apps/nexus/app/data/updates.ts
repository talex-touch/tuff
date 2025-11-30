export type ReleaseChannelId = 'release' | 'snapshot'

export interface ReleaseChannelDefinition {
  id: ReleaseChannelId
  icon: string
  badgeKey: string
  labelKey: string
  descriptionKey: string
  metaKey: string
}

export interface ReleaseDownloadLink {
  id: string
  labelKey: string
  descriptionKey?: string
  href: string
}

export interface ReleaseEntryDefinition {
  key: string
  version: string
  channel: ReleaseChannelId
  releasedAt: string
  notesPath: string
  downloads: ReleaseDownloadLink[]
}

export const releaseChannels: ReleaseChannelDefinition[] = [
  {
    id: 'release',
    icon: 'i-carbon-checkmark-filled',
    badgeKey: 'updates.channels.release.badge',
    labelKey: 'updates.channels.release.label',
    descriptionKey: 'updates.channels.release.description',
    metaKey: 'updates.channels.release.meta',
  },
  {
    id: 'snapshot',
    icon: 'i-carbon-flash-filled',
    badgeKey: 'updates.channels.snapshot.badge',
    labelKey: 'updates.channels.snapshot.label',
    descriptionKey: 'updates.channels.snapshot.description',
    metaKey: 'updates.channels.snapshot.meta',
  },
]

export const releaseEntries: ReleaseEntryDefinition[] = [
  {
    key: 'v2_0_0_preview',
    version: 'v2.0.0-preview',
    channel: 'snapshot',
    releasedAt: '2023-06-12',
    notesPath: '/docs/about/changelog#v2-0-0',
    downloads: [
      {
        id: 'release-portal',
        labelKey: 'updates.downloads.previewPortal',
        descriptionKey: 'updates.downloads.previewPortalDescription',
        href: 'https://github.com/talex-touch/tuff-nexus/releases/tag/v2.0.0-preview',
      },
    ],
  },
  {
    key: 'v2_0_0_dev5',
    version: 'v2.0.0-dev.5',
    channel: 'snapshot',
    releasedAt: '2023-05-28',
    notesPath: '/docs/about/changelog#v2-0-0',
    downloads: [
      {
        id: 'release-portal',
        labelKey: 'updates.downloads.previewPortal',
        descriptionKey: 'updates.downloads.previewPortalDescription',
        href: 'https://github.com/talex-touch/tuff-nexus/releases/tag/v2.0.0-dev.5',
      },
    ],
  },
  {
    key: 'v1_2_0',
    version: 'v1.2.0',
    channel: 'release',
    releasedAt: '2023-05-01',
    notesPath: '/docs/about/changelog#v1-2-0',
    downloads: [
      {
        id: 'release-portal',
        labelKey: 'updates.downloads.releasePortal',
        descriptionKey: 'updates.downloads.releasePortalDescription',
        href: 'https://github.com/talex-touch/tuff-nexus/releases/tag/v1.2.0',
      },
    ],
  },
  {
    key: 'v1_1_0',
    version: 'v1.1.0',
    channel: 'release',
    releasedAt: '2023-04-23',
    notesPath: '/docs/about/changelog#v1-1-0',
    downloads: [
      {
        id: 'release-portal',
        labelKey: 'updates.downloads.releasePortal',
        descriptionKey: 'updates.downloads.releasePortalDescription',
        href: 'https://github.com/talex-touch/tuff-nexus/releases/tag/v1.1.0',
      },
    ],
  },
  {
    key: 'v1_0_0',
    version: 'v1.0.0',
    channel: 'release',
    releasedAt: '2023-04-19',
    notesPath: '/docs/about/changelog#v1-0-0',
    downloads: [
      {
        id: 'release-portal',
        labelKey: 'updates.downloads.releasePortal',
        descriptionKey: 'updates.downloads.releasePortalDescription',
        href: 'https://github.com/talex-touch/tuff-nexus/releases/tag/v1.0.0',
      },
    ],
  },
]
