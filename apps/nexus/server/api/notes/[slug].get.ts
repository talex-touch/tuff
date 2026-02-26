import { createError } from 'h3'
import { buildReleaseNotesSlug, isReleaseNotesSlug } from '../../utils/releaseNotesPath'
import { listReleases } from '../../utils/releasesStore'

function normalizeTagVersion(tag: string): string {
  return tag.trim().toLowerCase().replace(/^v/, '')
}

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug || !isReleaseNotesSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notes slug.' })
  }

  const releases = await listReleases(event, { status: 'published', limit: 200 })
  const resolvedSlug = slug.trim().toLowerCase()

  const release = releases.find((item) => {
    const versionSlug = buildReleaseNotesSlug(item.version)
    if (versionSlug === resolvedSlug)
      return true

    const tagVersionSlug = buildReleaseNotesSlug(normalizeTagVersion(item.tag))
    return tagVersionSlug === resolvedSlug
  })

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release notes not found.' })

  return {
    note: {
      slug: resolvedSlug,
      path: `/notes/${resolvedSlug}`,
      releaseTag: release.tag,
      version: release.version,
      title: release.name || release.tag,
      channel: release.channel,
      publishedAt: release.publishedAt ?? release.createdAt,
      notes: release.notes,
      notesHtml: release.notesHtml ?? null,
    },
  }
})
