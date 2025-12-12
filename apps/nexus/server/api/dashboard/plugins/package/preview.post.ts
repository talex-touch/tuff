import { createError, readFormData } from 'h3'
import { Buffer } from 'node:buffer'
import { requireAuth } from '../../../../utils/auth'
import { extractTpexMetadata } from '../../../../utils/tpex'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const formData = await readFormData(event)
  const packageFile = formData.get('package')

  if (!isFile(packageFile))
    throw createError({ statusCode: 400, statusMessage: 'Package file is required.' })

  const buffer = Buffer.from(await packageFile.arrayBuffer())
  const metadata = await extractTpexMetadata(buffer)

  // Generate icon preview data URL if icon was extracted
  let iconDataUrl: string | null = null
  if (metadata.iconBuffer && metadata.iconMimeType) {
    const base64 = metadata.iconBuffer.toString('base64')
    iconDataUrl = `data:${metadata.iconMimeType};base64,${base64}`
  }

  return {
    manifest: metadata.manifest ?? null,
    readmeMarkdown: metadata.readmeMarkdown ?? null,
    iconDataUrl,
    hasIcon: !!metadata.iconBuffer,
  }
})
