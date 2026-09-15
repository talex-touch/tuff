import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Detect an installed Doubao (ByteDance) on-device ASR model, and say plainly that Tuff
 * cannot run it.
 *
 * This probe exists because the question "can we just use the model already on this
 * machine?" recurs, and answering it costs a week of reverse engineering each time. The
 * answer, established by inspection, is no — and the reasons are structural, not licensing
 * paperwork:
 *
 *  - The weights ship inside a `FLUTE` v3 container (`FilesystemPackedMmap`) whose member
 *    payloads are obfuscated with a per-file streaming transform, so they are not a
 *    standard tensor format any existing runtime could open.
 *  - Execution requires `flute`/`PantherInference`, ByteDance's own inference engine
 *    (PantherLite: per-column Q4 GEMM kernels, Metal shaders, W8A8/INT8 KV cache). It is
 *    statically linked into the IME binary and exposes no reusable entry point.
 *  - The packed header is protected by an integrity check bound to the bundle id and code
 *    signature, so the payload is not loadable outside the signed app either.
 *  - Redistributing the weights is not permitted, and no authorization is available.
 *
 * What *is* reusable is the design, which the Tuff runtime already reflects: a streamed
 * acoustic encoder, an alignment stage, a small decoder, and speculative decoding. The
 * probe's job is to stop a future engineer from rediscovering the negative result, and to
 * let the UI state the situation truthfully to a user who has this model installed.
 */

/** Where the IME keeps its state. The model lives in the user domain, so no privilege is needed. */
const DOUBAO_SUPPORT_DIRECTORY = join(homedir(), 'Library', 'Application Support', 'DoubaoIme')
const ACTIVE_LAYOUT_FILE = 'ASRContext/offline_model_active_layout.json'
const MANIFEST_FILE = 'ASRContext/offline_model_manifest.json'

export interface DetectedForeignModel {
  vendor: 'doubao'
  /** Model file the installed app has marked active. */
  activeMainModel: string
  /** Auxiliary context model (dictionary/NER/pinyin), when one is installed. */
  activeContextModel?: string
  /** Declared component versions, keyed by the manifest's logical model name. */
  versions: Record<string, string>
  /** Size of the active main model in bytes, as declared by the manifest. */
  mainModelBytes?: number
}

export interface ForeignModelProbeResult {
  detected: boolean
  model?: DetectedForeignModel
  /** Always false for this vendor: no redistributable runtime exists. */
  executable: false
  /** Why Tuff will not offer it, in terms a user or a maintainer can act on. */
  reason: string
}

const NOT_EXECUTABLE_REASON
  = 'The Doubao offline model is packaged for ByteDance\'s private FLUTE/PantherLite runtime and is protected by a '
    + 'per-build signature check, so no runtime outside the signed IME can load it. The weights are also not licensed '
    + 'for redistribution. Tuff therefore reports it but never offers it as a selectable model.'

/**
 * Read one property off an unparsed JSON value.
 *
 * The app that writes these files is not ours, so their shape is checked where it is used
 * rather than asserted up front: a missing or renamed key must degrade to `undefined`.
 */
function jsonProperty(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined
  return (value as Record<string, unknown>)[key]
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  }
  catch {
    return undefined
  }
}

/** Collect the installed component versions, and the main model's declared size. */
function readManifestComponents(manifest: unknown): { versions: Record<string, string>, mainModelBytes?: number } {
  const versions: Record<string, string> = {}
  let mainModelBytes: number | undefined

  const models = jsonProperty(manifest, 'models')
  if (typeof models !== 'object' || models === null) return { versions }

  for (const [logicalName, components] of Object.entries(models as Record<string, unknown>)) {
    if (!Array.isArray(components)) continue
    const installed = components.find(component => jsonProperty(component, 'installState') === 'installed') ?? components[0]
    if (installed === undefined) continue

    const version = jsonProperty(installed, 'version')
    if (typeof version === 'string') versions[logicalName] = version

    const size = jsonProperty(installed, 'sourceFileSize')
    if (logicalName === 'acllm_main_model_mac' && typeof size === 'number') mainModelBytes = size
  }

  return mainModelBytes === undefined ? { versions } : { versions, mainModelBytes }
}

/**
 * Inspect the machine for a Doubao offline model.
 *
 * Never throws: an absent or malformed install is the ordinary case on most machines, and
 * a capability probe that failed loudly would be worse than one reporting `detected: false`.
 */
export async function probeDoubaoOfflineModel(
  supportDirectory = DOUBAO_SUPPORT_DIRECTORY,
): Promise<ForeignModelProbeResult> {
  const layout = await readJson(join(supportDirectory, ACTIVE_LAYOUT_FILE))
  const activeMainModel = jsonProperty(layout, 'mainModelActiveRelativePath')
  if (typeof activeMainModel !== 'string') {
    return { detected: false, executable: false, reason: NOT_EXECUTABLE_REASON }
  }

  const { versions, mainModelBytes } = readManifestComponents(await readJson(join(supportDirectory, MANIFEST_FILE)))
  const activeContextModel = jsonProperty(layout, 'contextAuxActiveRelativePath')

  return {
    detected: true,
    executable: false,
    reason: NOT_EXECUTABLE_REASON,
    model: {
      vendor: 'doubao',
      activeMainModel,
      versions,
      ...(typeof activeContextModel === 'string' ? { activeContextModel } : {}),
      ...(mainModelBytes === undefined ? {} : { mainModelBytes }),
    },
  }
}