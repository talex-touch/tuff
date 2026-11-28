import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createError, readFormData } from 'h3'
import { requireAuthOrApiKey } from '../../../../utils/auth'
import { listActivePluginSecurityScanWaivers } from '../../../../utils/pluginSecurityScanWaiverStore'
import { extractTpexMetadata, getTpexAdmissionFailure } from '../../../../utils/tpex'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  await requireAuthOrApiKey(event, ['plugin:publish'])

  const formData = await readFormData(event)
  const packageFile = formData.get('package')

  if (!isFile(packageFile))
    throw createError({ statusCode: 400, statusMessage: 'Package file is required.' })

  const buffer = Buffer.from(await packageFile.arrayBuffer())
  const artifactSha256 = createHash('sha256').update(buffer).digest('hex')
  const waivers = await listActivePluginSecurityScanWaivers(event, artifactSha256)
  const metadata = await extractTpexMetadata(buffer, undefined, waivers)
  const admissionFailure = getTpexAdmissionFailure(metadata)
  if (admissionFailure) {
    throw createError({
      statusCode: 400,
      statusMessage: `${admissionFailure.code}: ${admissionFailure.reason}`,
    })
  }

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
    securityScan: {
      decision: metadata.securityScan.decision,
      scannerVersion: metadata.securityScan.scannerVersion,
      ruleSetVersion: metadata.securityScan.ruleSetVersion,
      artifactSha256: metadata.securityScan.artifactSha256,
      findings: metadata.securityScan.findings.map(finding => ({
        code: finding.code,
        severity: finding.severity,
        location: finding.location,
        permissionId: finding.permissionId,
        waived: Boolean(finding.waiver),
      })),
    },
  }
})
