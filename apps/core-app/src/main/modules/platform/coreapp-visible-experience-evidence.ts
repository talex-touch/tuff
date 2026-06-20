export const COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA = 'coreapp-visible-experience-evidence/v1'

export type CoreAppVisibleExperienceStatus = 'passed' | 'failed' | 'blocked' | 'pending'
export type CoreAppVisibleExperienceGroup =
  | 'startup'
  | 'search'
  | 'auth'
  | 'ai'
  | 'assistant'
  | 'workflow'
  | 'provider'

export interface CoreAppVisibleExperienceSurface {
  id: string
  group: CoreAppVisibleExperienceGroup
  title: string
  required: boolean
  requiresVisualArtifact: boolean
  collectionSteps: string[]
  requiredEvidence: string[]
  requiredEvidenceTags?: string[]
  recommendedArtifacts: string[]
  blockedWhen: string[]
}

export interface CoreAppVisibleExperienceEvidenceItem {
  id: string
  status: CoreAppVisibleExperienceStatus
  artifactPaths: string[]
  checkedEvidence: string[]
  evidenceTags?: string[]
  evidenceTagArtifacts?: Record<string, string[]>
  notes?: string
  checkedAt?: string
}

export interface CoreAppVisibleExperienceManifest {
  schema: typeof COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA
  generatedAt: string
  baselineVersion: string
  verification?: {
    recommendedCommand?: string
  }
  surfaces: CoreAppVisibleExperienceEvidenceItem[]
}

export interface CoreAppVisibleExperienceGateOptions {
  requireAllPassed?: boolean
  requireArtifactPaths?: boolean
  requireVisualArtifacts?: boolean
  requireCheckedEvidence?: boolean
  requireEvidenceTags?: boolean
}

export interface CoreAppVisibleExperienceGate {
  passed: boolean
  failures: string[]
}

export type CoreAppVisibleExperienceReadinessSeverity = 'ready' | 'warning' | 'blocked'

export interface CoreAppVisibleExperienceReadinessInput {
  expectedVersion: string
  packagedArtifact?: {
    exists: boolean
    version?: string | null
    path?: string
  }
  browserSmoke?: {
    archived: boolean
    hasIpcRendererMissingError?: boolean
    path?: string
  }
  electronDevCapture?: {
    attempted: boolean
    remoteDebuggingAvailable: boolean
    path?: string
  }
  screenRecording?: {
    granted: boolean
    checked: boolean
  }
}

export interface CoreAppVisibleExperienceReadinessCheck {
  id: string
  status: CoreAppVisibleExperienceReadinessSeverity
  message: string
  nextAction?: string
  artifactPath?: string
}

export interface CoreAppVisibleExperienceReadinessReport {
  ready: boolean
  checks: CoreAppVisibleExperienceReadinessCheck[]
}

export const COREAPP_VISIBLE_EXPERIENCE_SURFACES: readonly CoreAppVisibleExperienceSurface[] = [
  {
    id: 'startup-packaged-hot',
    group: 'startup',
    title: 'Packaged hot startup benchmark',
    required: true,
    requiresVisualArtifact: false,
    collectionSteps: [
      'Confirm the packaged app bundle version matches apps/core-app/package.json.',
      'Run the packaged hot-start benchmark against the current bundle.',
      'Attach the summary report and at least one per-run report.'
    ],
    requiredEvidence: [
      'Current package version is used by the packaged artifact',
      'Hot-start benchmark summary path is attached',
      'Startup health and renderer-ready timing are captured',
      'Warnings/errors are recorded without redaction of failure codes'
    ],
    recommendedArtifacts: [
      'docs/engineering/reports/startup-packaged-hot-runs-YYYY-MM-DD/汇总报告.md',
      'docs/engineering/reports/startup-packaged-hot-runs-YYYY-MM-DD/第01次运行报告.md'
    ],
    blockedWhen: [
      'The packaged artifact version does not match the package baseline.',
      'The app does not reach startup health or renderer-ready markers.'
    ]
  },
  {
    id: 'startup-packaged-cold',
    group: 'startup',
    title: 'Packaged cold startup benchmark',
    required: true,
    requiresVisualArtifact: false,
    collectionSteps: [
      'Use an isolated userData directory for cold-start samples.',
      'Run the packaged cold-start benchmark against the current bundle.',
      'Attach the summary report and WAL/health long-tail notes.'
    ],
    requiredEvidence: [
      'Current package version is used by the packaged artifact',
      'Cold-start benchmark summary path is attached',
      'Isolated userData path is used',
      'WAL/health long-tail notes are attached'
    ],
    recommendedArtifacts: [
      'docs/engineering/reports/startup-packaged-cold-runs-YYYY-MM-DD/汇总报告.md',
      'docs/engineering/reports/startup-packaged-cold-runs-YYYY-MM-DD/第01次运行报告.md'
    ],
    blockedWhen: [
      'The run uses the normal user profile instead of an isolated benchmark profile.',
      'Cold-start timing is collected from a stale packaged artifact.'
    ]
  },
  {
    id: 'startup-first-screen',
    group: 'startup',
    title: 'First-screen visual state',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Launch the current app build and wait only until the first usable screen appears.',
      'Capture the full first screen before navigating away.',
      'Open Settings/About or diagnostics and capture the reachable startup health summary.'
    ],
    requiredEvidence: [
      'Screenshot or recording shows the first usable CoreApp screen',
      'No blank or blocked loading surface is visible',
      'Startup health summary is reachable from Settings/About'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/startup-first-screen.png',
      'evidence/coreapp-visible/startup-health-summary.png'
    ],
    blockedWhen: [
      'The screenshot is taken after manual navigation that hides startup state.',
      'The first screen is blank, indefinitely loading, or missing startup health access.'
    ]
  },
  {
    id: 'corebox-search-states',
    group: 'search',
    title: 'CoreBox search states',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Open CoreBox with no query and capture the idle or warm-up state.',
      'Run a query that returns no results and capture the retry/settings actions.',
      'Run a query with mixed sources and capture status/reason pills in result rows.'
    ],
    requiredEvidence: [
      'Idle state is visible before query input',
      'Searching or recommendation warm-up state is visible',
      'No-result state shows retry and File Index settings actions',
      'Result source/status/reason pills fit without overlap'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/corebox-idle.png',
      'evidence/coreapp-visible/corebox-no-result.png',
      'evidence/coreapp-visible/corebox-result-reasons.png'
    ],
    blockedWhen: [
      'A screenshot only shows populated results and misses idle/no-result states.',
      'Reason/status text overlaps row content or is clipped.'
    ]
  },
  {
    id: 'app-index-workbench',
    group: 'search',
    title: 'App Index manager workbench',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Open the App Index manager from Settings.',
      'Capture summary counts and source filters.',
      'Apply at least one source filter and one diagnostic filter, then capture the filtered state.'
    ],
    requiredEvidence: [
      'Summary counts are visible',
      'Source filters cover UWP/Store, Steam, shortcuts, protocol, AppRef, and path entries',
      'Diagnostic filters distinguish attention, found, unchecked, and disabled entries',
      'Empty states distinguish no entries from filtered-out entries'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/app-index-summary.png',
      'evidence/coreapp-visible/app-index-filtered-empty.png'
    ],
    blockedWhen: [
      'The manager has no diagnostic/source filter evidence.',
      'Filtered empty state cannot be distinguished from an unconfigured app index.'
    ]
  },
  {
    id: 'browser-login-recovery',
    group: 'auth',
    title: 'Browser login recovery',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Trigger login while forcing or observing a browser-open failure path.',
      'Capture the recovery dialog with manual URL and short-code copy actions.',
      'Capture timeout or network-failure copy if the session fails.'
    ],
    requiredEvidence: [
      'Browser-open failure keeps the device authorization session alive',
      'Manual login URL copy action is visible',
      'Short user code copy action is visible',
      'Timeout and network failure copy is user-readable'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/login-browser-open-failure.png',
      'evidence/coreapp-visible/login-timeout-or-network-failure.png'
    ],
    blockedWhen: [
      'The dialog only shows a generic error without manual recovery actions.',
      'The device authorization session is cancelled before the user can copy recovery data.'
    ]
  },
  {
    id: 'corebox-ai-ask',
    group: 'ai',
    title: 'CoreBox AI Ask preview',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Ask a text question from CoreBox and capture the text.chat answer preview.',
      'Ask with a clipboard image and capture the vision.ocr to text.chat answer preview.',
      'Capture provider/model/latency/trace/input metadata in the preview footer for both success paths.',
      'Capture recoverable failure states for logged-out, provider unavailable, quota exhausted, and model unsupported cases.',
      'Capture permission denied and Local/Ollama routing cases; local preferred routing must not reach a disabled Nexus provider.'
    ],
    requiredEvidence: [
      'CoreBox AI Ask text.chat success preview is visible',
      'CoreBox AI Ask clipboard image vision.ocr to text.chat success preview is visible',
      'Text and OCR success previews show a non-empty answer without empty-response copy',
      'Provider, model, latency, trace id, and input kind metadata are visible for text and OCR paths',
      'Copy failure remains visible inside the preview',
      'Logged-out failure shows a sign-in recovery hint',
      'Provider unavailable failure shows a provider health or settings recovery hint',
      'Quota exhausted failure shows a credits or team quota recovery hint',
      'Model unsupported failure shows a supported model or capability recovery hint',
      'Permission denied failure does not call Intelligence SDK and shows a permission recovery hint',
      'Local/Ollama preferred routing does not call disabled Nexus provider and shows routing trace or provider metadata'
    ],
    requiredEvidenceTags: [
      'AI-STABLE-01',
      'AI-STABLE-02',
      'AI-STABLE-03',
      'AI-STABLE-04',
      'AI-STABLE-05',
      'AI-STABLE-06',
      'AI-STABLE-07',
      'AI-STABLE-08'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/corebox-ai-text-success.png',
      'evidence/coreapp-visible/corebox-ai-ocr-success.png',
      'evidence/coreapp-visible/corebox-ai-copy-failure.png',
      'evidence/coreapp-visible/corebox-ai-failure-logged-out.png',
      'evidence/coreapp-visible/corebox-ai-failure-provider-unavailable.png',
      'evidence/coreapp-visible/corebox-ai-failure-quota-exhausted.png',
      'evidence/coreapp-visible/corebox-ai-failure-model-unsupported.png',
      'evidence/coreapp-visible/corebox-ai-failure-permission-denied.png',
      'evidence/coreapp-visible/corebox-ai-local-ollama-routing.png'
    ],
    blockedWhen: [
      'The preview hides provider/model/trace context.',
      'Text or OCR success shows empty response, no answer, 空回答, or 无回答 copy.',
      'Text success and OCR success are not captured as separate recent paths.',
      'Logged-out, provider unavailable, quota exhausted, or model unsupported appears as a generic error without a recovery hint.',
      'Permission denied still invokes Intelligence SDK.',
      'Local/Ollama preferred routing calls a disabled Nexus provider.'
    ]
  },
  {
    id: 'omnipanel-writing-tools',
    group: 'ai',
    title: 'OmniPanel Writing Tools',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Open OmniPanel with selected text and capture available writing actions.',
      'Run translate, summarize, rewrite, explain, or review and capture the result preview.',
      'Capture copy, replace clipboard, retry, and replace confirmation states.'
    ],
    requiredEvidence: [
      'Selected-text context or recovery hint is visible',
      'Translate/summarize/rewrite/explain/review actions are visible as applicable',
      'AI result preview is visible',
      'Copy, replace clipboard, retry, and confirmation states are visible'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/omnipanel-writing-tools.png',
      'evidence/coreapp-visible/omnipanel-replace-confirmation.png',
      'evidence/coreapp-visible/omnipanel-selection-recovery.png'
    ],
    blockedWhen: [
      'No selected-text context or recovery hint is visible.',
      'Clipboard replace can happen without confirmation evidence.'
    ]
  },
  {
    id: 'assistant-floating-ball-entry',
    group: 'assistant',
    title: 'Assistant floating ball entry',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Enable Assistant and the floating ball from Settings while keeping voice wake disabled.',
      'Capture the floating ball visible above the current desktop or CoreApp surface.',
      'Drag the floating ball, reopen the app or settings surface, and capture the persisted position.',
      'Click the floating ball and capture the Voice Panel opened next to the ball.'
    ],
    requiredEvidence: [
      'Settings show Assistant enabled and voice wake disabled',
      'Floating ball is visible and does not steal focus from the active app',
      'Dragged floating ball position persists after reopening the Assistant surface',
      'Clicking the floating ball opens the Voice Panel beside the ball'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/assistant-floating-ball-settings.png',
      'evidence/coreapp-visible/assistant-floating-ball-visible.png',
      'evidence/coreapp-visible/assistant-floating-ball-drag-persist.png',
      'evidence/coreapp-visible/assistant-voice-panel-open.png'
    ],
    blockedWhen: [
      'The floating ball only appears after enabling voice wake.',
      'The dragged position is lost after reopening or monitor bounds are not respected.',
      'Clicking the floating ball does not open a usable text panel.'
    ]
  },
  {
    id: 'assistant-screenshot-translate',
    group: 'assistant',
    title: 'Assistant clipboard image translation',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Open the Assistant Voice Panel from the floating ball and trigger clipboard image translation.',
      'Capture the translated image pin window or detached DivisionBox result for a copied image.',
      'Repeat with an empty clipboard image state and capture the recovery hint.',
      'Repeat with Nexus/provider unavailable or logged out and capture the fallback or recovery hint.'
    ],
    requiredEvidence: [
      'Clipboard image translation starts from the Assistant Voice Panel',
      'The Assistant action reads the current clipboard image instead of initiating screen capture',
      'Translated clipboard image result appears in the image translation pin window or detached widget',
      'Empty clipboard image and provider fallback remain visible and recoverable'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/assistant-clipboard-image-translate-start.png',
      'evidence/coreapp-visible/assistant-clipboard-image-translate-result.png',
      'evidence/coreapp-visible/assistant-clipboard-image-empty.png',
      'evidence/coreapp-visible/assistant-clipboard-image-provider-fallback.png'
    ],
    blockedWhen: [
      'The Assistant path captures the screen instead of consuming the current clipboard image.',
      'The action writes only to clipboard and does not show a visible translation result.',
      'Permission/provider failures collapse into a generic error without a recovery hint.'
    ]
  },
  {
    id: 'workflow-use-model-review-queue',
    group: 'workflow',
    title: 'Workflow Use Model and Review Queue',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Run a workflow containing a Use Model step.',
      'Capture the generated output inside Review Queue before accepting it.',
      'Capture pending, copied, clipboard-replaced, and failed filters or representative states.'
    ],
    requiredEvidence: [
      'Use Model output enters Review Queue',
      'Pending/copied/clipboard-replaced/failed filters are visible',
      'Runtime cost signals are visible',
      'Failed copy/replace actions expose retry and clear-failure actions'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/workflow-review-queue-pending.png',
      'evidence/coreapp-visible/workflow-review-queue-failed.png'
    ],
    blockedWhen: [
      'Use Model output bypasses Review Queue.',
      'Failed copy/replace actions cannot be retried or cleared from the queue.'
    ]
  },
  {
    id: 'provider-registry-observability',
    group: 'provider',
    title: 'Nexus Provider Registry observability',
    required: true,
    requiresVisualArtifact: true,
    collectionSteps: [
      'Open Nexus Provider Registry Admin with real registry data.',
      'Capture provider health, latest usage, and attention filters.',
      'Capture Scene latest run, recent failures, and next-action hints.'
    ],
    requiredEvidence: [
      'Provider health and latest usage summaries are visible',
      'Scene latest run and recent failure summaries are visible',
      'Attention/healthy/degraded/unhealthy/unknown filters are visible',
      'Next-action hints explain degraded or unknown state'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/provider-registry-health.png',
      'evidence/coreapp-visible/provider-registry-scene-run.png'
    ],
    blockedWhen: [
      'The screenshot uses seed/mock data without marking it as non-production evidence.',
      'Unknown or degraded provider state has no next-action hint.'
    ]
  },
  {
    id: 'provider-migration-evidence',
    group: 'provider',
    title: 'Legacy intelligence provider retirement evidence',
    required: true,
    requiresVisualArtifact: false,
    collectionSteps: [
      'Run Provider Registry migration dry-run or execute mode from Dashboard Admin or API.',
      'Copy the generated evidence summary.',
      'Review the summary for readiness, blockers, counts, and secret leakage before attaching it.'
    ],
    requiredEvidence: [
      'Dry-run or execute migration evidence summary is attached',
      'Readiness, blockers, migrated/skipped/failed counts are visible',
      'No provider secret is copied into metadata or evidence text',
      'Registry-primary readiness is not claimed for dry-run-only evidence'
    ],
    recommendedArtifacts: [
      'evidence/coreapp-visible/provider-migration-dry-run.md',
      'evidence/coreapp-visible/provider-migration-execute.md'
    ],
    blockedWhen: [
      'Dry-run-only evidence is used to claim registry-primary runtime readiness.',
      'The copied evidence contains provider secrets or raw API keys.'
    ]
  }
] as const

export function buildCoreAppVisibleExperienceManifest(params: {
  baselineVersion: string
  generatedAt?: string
  evidenceDir?: string
}): CoreAppVisibleExperienceManifest {
  const evidenceDir = normalizeEvidenceDir(params.evidenceDir ?? 'evidence/coreapp-visible')
  const manifestPath = `${evidenceDir}/coreapp-visible-experience-manifest.json`

  return {
    schema: COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    baselineVersion: params.baselineVersion,
    verification: {
      recommendedCommand: `corepack pnpm -C "apps/core-app" run visible:experience:verify -- --input "${manifestPath}" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireEvidenceTags --requireExistingArtifacts --requireNonEmptyArtifacts`
    },
    surfaces: COREAPP_VISIBLE_EXPERIENCE_SURFACES.map((surface) => ({
      id: surface.id,
      status: 'pending',
      artifactPaths: [],
      checkedEvidence: [],
      evidenceTags: [],
      evidenceTagArtifacts: {},
      notes: ''
    }))
  }
}

export function verifyCoreAppVisibleExperienceManifest(
  manifest: CoreAppVisibleExperienceManifest,
  options: CoreAppVisibleExperienceGateOptions = {}
): CoreAppVisibleExperienceGate {
  const failures: string[] = []

  if (manifest.schema !== COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA) {
    failures.push(`Unsupported visible experience manifest schema: ${String(manifest.schema)}`)
    return { passed: false, failures }
  }

  const itemsById = new Map(manifest.surfaces.map((item) => [item.id, item]))

  for (const surface of COREAPP_VISIBLE_EXPERIENCE_SURFACES) {
    const item = itemsById.get(surface.id)
    if (!item) {
      failures.push(`Missing visible experience evidence item: ${surface.id}`)
      continue
    }

    if (options.requireAllPassed && surface.required && item.status !== 'passed') {
      failures.push(`Visible experience item is not passed: ${surface.id}`)
    }

    const artifactPaths = item.artifactPaths.filter((artifactPath) => artifactPath.trim())
    if (options.requireArtifactPaths && surface.required && artifactPaths.length === 0) {
      failures.push(`Visible experience item has no artifact path: ${surface.id}`)
    }

    if (
      options.requireVisualArtifacts &&
      surface.required &&
      surface.requiresVisualArtifact &&
      !artifactPaths.some(isVisualArtifactPath)
    ) {
      failures.push(
        `Visible experience item has no screenshot or recording artifact: ${surface.id}`
      )
    }

    if (options.requireCheckedEvidence && surface.required) {
      const checkedEvidence = new Set(
        item.checkedEvidence.map((evidence) => normalizeEvidenceText(evidence)).filter(Boolean)
      )

      for (const requirement of surface.requiredEvidence) {
        if (!checkedEvidence.has(normalizeEvidenceText(requirement))) {
          failures.push(
            `Visible experience item is missing required evidence check: ${surface.id} -> ${requirement}`
          )
        }
      }
    }

    if (options.requireEvidenceTags && surface.required && surface.requiredEvidenceTags?.length) {
      const evidenceTags = new Set(
        (item.evidenceTags ?? []).map((tag) => normalizeEvidenceTag(tag)).filter(Boolean)
      )
      const requiredEvidenceTags = new Set(
        surface.requiredEvidenceTags.map((tag) => normalizeEvidenceTag(tag))
      )
      const artifactPathSet = new Set(artifactPaths)
      const visualArtifactsByPath = new Map<string, string[]>()

      for (const evidenceTag of evidenceTags) {
        if (requiredEvidenceTags.has(evidenceTag)) continue
        failures.push(
          `Visible experience item has unexpected evidence tag: ${surface.id} -> ${evidenceTag}`
        )
      }

      for (const artifactTag of Object.keys(item.evidenceTagArtifacts ?? {})) {
        const normalizedArtifactTag = normalizeEvidenceTag(artifactTag)
        if (requiredEvidenceTags.has(normalizedArtifactTag)) continue
        failures.push(
          `Visible experience item has artifact for unexpected evidence tag: ${surface.id} -> ${artifactTag}`
        )
      }

      for (const requiredTag of surface.requiredEvidenceTags) {
        const normalizedTag = normalizeEvidenceTag(requiredTag)
        if (!evidenceTags.has(normalizedTag)) {
          failures.push(
            `Visible experience item is missing required evidence tag: ${surface.id} -> ${requiredTag}`
          )
          continue
        }

        const tagArtifacts = getEvidenceTagArtifacts(item, requiredTag)
        if (tagArtifacts.length === 0) {
          failures.push(
            `Visible experience item has no artifact for evidence tag: ${surface.id} -> ${requiredTag}`
          )
          continue
        }

        for (const tagArtifact of tagArtifacts) {
          if (!artifactPathSet.has(tagArtifact)) {
            failures.push(
              `Visible experience item evidence tag references unknown artifact: ${surface.id} -> ${requiredTag} -> ${tagArtifact}`
            )
          }
        }
        if (!tagArtifacts.some(isVisualArtifactPath)) {
          failures.push(
            `Visible experience item evidence tag has no screenshot or recording artifact: ${surface.id} -> ${requiredTag}`
          )
        }

        for (const tagArtifact of tagArtifacts.filter(isVisualArtifactPath)) {
          const tags = visualArtifactsByPath.get(tagArtifact) ?? []
          tags.push(requiredTag)
          visualArtifactsByPath.set(tagArtifact, tags)
        }
      }

      for (const [artifactPath, tags] of visualArtifactsByPath.entries()) {
        if (tags.length <= 1) continue
        failures.push(
          `Visible experience item evidence artifact is reused across tags: ${surface.id} -> ${artifactPath} -> ${tags.join(', ')}`
        )
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures
  }
}

export function renderCoreAppVisibleExperienceEvidenceTemplate(
  manifest: CoreAppVisibleExperienceManifest
): string {
  const itemsById = new Map(manifest.surfaces.map((item) => [item.id, item]))
  const lines = [
    '# CoreApp Visible Experience Evidence',
    '',
    `- Schema: ${manifest.schema}`,
    `- Baseline version: ${manifest.baselineVersion}`,
    `- Generated at: ${manifest.generatedAt}`,
    '',
    '## Collection Rules',
    '',
    '- Use real CoreApp UI on the target device; do not substitute mock screenshots.',
    '- Keep sensitive content out of screenshots and notes.',
    '- Mark an item `blocked` rather than `passed` when the required artifact is missing.',
    '- Attach the packaged startup benchmark reports separately from UI screenshots.',
    '',
    '## Required Surfaces',
    ''
  ]

  for (const surface of COREAPP_VISIBLE_EXPERIENCE_SURFACES) {
    const item = itemsById.get(surface.id)
    lines.push(`### ${surface.title}`, '')
    lines.push(`- ID: ${surface.id}`)
    lines.push(`- Group: ${surface.group}`)
    lines.push(`- Required: ${surface.required ? 'yes' : 'no'}`)
    lines.push(`- Requires screenshot/recording: ${surface.requiresVisualArtifact ? 'yes' : 'no'}`)
    lines.push(`- Status: ${item?.status ?? 'pending'}`)
    lines.push('- Collection steps:')
    for (const step of surface.collectionSteps) {
      lines.push(`  - ${step}`)
    }
    lines.push('- Required evidence:')
    for (const requirement of surface.requiredEvidence) {
      const checked = item?.checkedEvidence
        .map((evidence) => normalizeEvidenceText(evidence))
        .includes(normalizeEvidenceText(requirement))
      lines.push(`  - [${checked ? 'x' : ' '}] ${requirement}`)
    }
    if (surface.requiredEvidenceTags?.length) {
      const evidenceTags = new Set(
        (item?.evidenceTags ?? []).map((tag) => normalizeEvidenceTag(tag)).filter(Boolean)
      )
      const canMarkEvidenceTagComplete = item?.status === 'passed'
      lines.push('- Required evidence tags:')
      for (const tag of surface.requiredEvidenceTags) {
        const hasEvidence = evidenceTags.has(normalizeEvidenceTag(tag))
        const checkbox = canMarkEvidenceTagComplete && hasEvidence ? 'x' : hasEvidence ? '-' : ' '
        lines.push(`  - [${checkbox}] ${tag}`)
        for (const artifactPath of getEvidenceTagArtifacts(item, tag)) {
          lines.push(`    - ${artifactPath}`)
        }
      }
    }
    lines.push('- Recommended artifacts:')
    for (const artifact of surface.recommendedArtifacts) {
      lines.push(`  - ${artifact}`)
    }
    lines.push('- Block instead of pass when:')
    for (const blocker of surface.blockedWhen) {
      lines.push(`  - ${blocker}`)
    }
    lines.push('- Artifact paths:')
    if (item?.artifactPaths.length) {
      for (const artifactPath of item.artifactPaths) {
        lines.push(`  - ${artifactPath}`)
      }
    } else {
      lines.push('  - _none_')
    }
    lines.push('- Notes:', '')
  }

  lines.push('## Final Verification', '', '```bash')
  lines.push(manifest.verification?.recommendedCommand ?? '')
  lines.push('```', '')

  return `${lines.join('\n').trimEnd()}\n`
}

export function buildCoreAppVisibleExperienceCaptureReadiness(
  input: CoreAppVisibleExperienceReadinessInput
): CoreAppVisibleExperienceReadinessReport {
  const checks: CoreAppVisibleExperienceReadinessCheck[] = []
  const packaged = input.packagedArtifact

  if (!packaged?.exists) {
    checks.push({
      id: 'packaged-artifact',
      status: 'blocked',
      message: 'Current packaged app artifact is missing.',
      nextAction: 'Build or provide a current packaged artifact before packaged startup evidence.'
    })
  } else if (packaged.version !== input.expectedVersion) {
    checks.push({
      id: 'packaged-artifact',
      status: 'blocked',
      message: `Packaged artifact version mismatch: expected ${input.expectedVersion}, got ${packaged.version ?? 'unknown'}.`,
      nextAction: 'Rebuild the packaged artifact before running packaged cold/hot benchmarks.',
      artifactPath: packaged.path
    })
  } else {
    checks.push({
      id: 'packaged-artifact',
      status: 'ready',
      message: `Packaged artifact matches expected version ${input.expectedVersion}.`,
      artifactPath: packaged.path
    })
  }

  const browserSmoke = input.browserSmoke
  if (browserSmoke?.archived) {
    checks.push({
      id: 'browser-smoke-boundary',
      status: browserSmoke.hasIpcRendererMissingError ? 'warning' : 'blocked',
      message: browserSmoke.hasIpcRendererMissingError
        ? 'Browser-only smoke is archived as negative evidence because Electron preload is unavailable.'
        : 'Browser-only smoke is archived but does not prove Electron UI readiness.',
      nextAction: 'Use Electron or packaged screenshots/recordings for visible-experience proof.',
      artifactPath: browserSmoke.path
    })
  } else {
    checks.push({
      id: 'browser-smoke-boundary',
      status: 'warning',
      message: 'No browser-only smoke boundary artifact is archived.',
      nextAction:
        'Archive negative browser smoke separately if a browser URL is used during triage.'
    })
  }

  const devCapture = input.electronDevCapture
  if (!devCapture?.attempted) {
    checks.push({
      id: 'electron-dev-capture',
      status: 'blocked',
      message: 'Electron dev capture has not been attempted.',
      nextAction: 'Attempt CDP/Playwright capture from Electron or use a packaged build.'
    })
  } else if (!devCapture.remoteDebuggingAvailable) {
    checks.push({
      id: 'electron-dev-capture',
      status: 'blocked',
      message: 'Electron dev capture did not expose a usable remote debugging target.',
      nextAction: 'Fix the dev capture chain or switch to packaged UI screenshots.',
      artifactPath: devCapture.path
    })
  } else {
    checks.push({
      id: 'electron-dev-capture',
      status: 'ready',
      message: 'Electron dev remote debugging target is available.',
      artifactPath: devCapture.path
    })
  }

  const screenRecording = input.screenRecording
  if (!screenRecording?.checked) {
    checks.push({
      id: 'screen-recording',
      status: 'warning',
      message: 'macOS Screen Recording permission has not been checked.',
      nextAction: 'Check Screen Recording permission before relying on OS-level screenshots.'
    })
  } else if (!screenRecording.granted) {
    checks.push({
      id: 'screen-recording',
      status: 'blocked',
      message: 'macOS Screen Recording permission is not granted.',
      nextAction: 'Grant Screen Recording permission or use a non-OS screenshot path.'
    })
  } else {
    checks.push({
      id: 'screen-recording',
      status: 'ready',
      message: 'macOS Screen Recording permission is granted.'
    })
  }

  return {
    ready: checks.every((check) => check.status !== 'blocked'),
    checks
  }
}

function normalizeEvidenceDir(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || 'evidence/coreapp-visible'
}

function isVisualArtifactPath(value: string): boolean {
  return /\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i.test(value.trim())
}

function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeEvidenceTag(value: string): string {
  return value.replace(/\s+/g, '').trim().toUpperCase()
}

function getEvidenceTagArtifacts(
  item: CoreAppVisibleExperienceEvidenceItem | undefined,
  tag: string
): string[] {
  if (!item?.evidenceTagArtifacts) return []
  const direct = item.evidenceTagArtifacts[tag]
  if (Array.isArray(direct)) return direct.filter((artifactPath) => artifactPath.trim())

  const normalizedTag = normalizeEvidenceTag(tag)
  const matchedKey = Object.keys(item.evidenceTagArtifacts).find(
    (key) => normalizeEvidenceTag(key) === normalizedTag
  )
  const matched = matchedKey ? item.evidenceTagArtifacts[matchedKey] : undefined
  return Array.isArray(matched) ? matched.filter((artifactPath) => artifactPath.trim()) : []
}
