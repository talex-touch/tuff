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

  return {
    manifest: metadata.manifest ?? null,
    readmeMarkdown: metadata.readmeMarkdown ?? null,
  }
})
