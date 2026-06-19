import { describe, expect, it } from 'vitest'
import {
  QUICK_OPS_CONFIRMATION_POLICY_SCHEMA,
  QUICK_OPS_EVIDENCE_CASES,
  QUICK_OPS_EVIDENCE_SCHEMA,
  QUICK_OPS_FILES_AND_TEMP_SCHEMA,
  QUICK_OPS_PACKAGED_SESSION_CLEANUP_SCHEMA,
  QUICK_OPS_PLATFORM_READONLY_SCHEMA,
  buildQuickOpsEvidenceManifest,
  renderQuickOpsEvidenceCollectionPlan,
  renderQuickOpsEvidenceTemplate,
  validateQuickOpsEvidenceArtifactContents,
  verifyQuickOpsEvidenceManifest
} from './quick-ops-evidence'
import {
  QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA,
  QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS,
  QUICK_OPS_FLOW_AI_EXPECTED_TARGETS
} from './quick-ops-flow-ai-adapter-audit'
import {
  QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS,
  QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS,
  QUICK_OPS_SURFACE_AUDIT_SCHEMA
} from './quick-ops-surface-audit'
import { resolveQuickOpsEvidenceTemplateOutputPaths } from '../../../../scripts/quickops-evidence-template'

describe('QuickOps evidence contract', () => {
  function buildPackagedSessionCleanupArtifact(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema: QUICK_OPS_PACKAGED_SESSION_CLEANUP_SCHEMA,
      packaged: {
        isPackaged: true,
        versionMatchesManifest: true,
        isolatedUserData: true
      },
      sessionCoverage: {
        startedKinds: [
          'keep-awake',
          'system-awake',
          'timer',
          'pomodoro',
          'stopwatch',
          'screen-clean'
        ],
        unsupportedKinds: []
      },
      beforeQuit: {
        visible: true,
        runningSessionCount: 6
      },
      quit: {
        normalQuit: true,
        externalKill: false
      },
      afterQuit: {
        runningSessionCount: 0,
        displayPowerBlockerActive: false,
        systemPowerBlockerActive: false,
        overlayWindowCount: 0,
        activeTimerCount: 0,
        activeStopwatchCount: 0
      },
      redaction: {
        noRuntimeObjects: true,
        noRawUserDataPath: true
      },
      gate: {
        passed: true
      },
      ...overrides
    })
  }

  function buildPlatformReadonlyArtifact(
    platform: 'macos' | 'windows' | 'linux',
    overrides: Record<string, unknown> = {}
  ): string {
    return JSON.stringify({
      schema: QUICK_OPS_PLATFORM_READONLY_SCHEMA,
      platform,
      collectedFromCurrentPlatform: true,
      localNetworkOnly: true,
      externalHttpRequestCount: 0,
      portStatus: {
        executedKill: false
      },
      dnsQuery: {
        usesLocalResolver: true,
        mutatedSystemDns: false
      },
      systemProxy: {
        credentialsRedacted: true
      },
      probes: {
        localIp: { state: 'passed' },
        networkStatus: { state: 'passed' },
        portStatus: { state: 'passed' },
        dnsQuery: { state: 'passed' },
        systemProxy: { state: 'passed' },
        batteryStatus: { state: 'degraded', reason: 'battery-api-unavailable' },
        diskSpace: { state: 'passed' },
        directoryUsage: { state: 'passed' }
      },
      redaction: {
        noProxyCredentials: true,
        noRawHomePath: true,
        noRawUserDataPath: true
      },
      gate: {
        passed: true
      },
      ...overrides
    })
  }

  function buildFilesAndTempArtifact(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema: QUICK_OPS_FILES_AND_TEMP_SCHEMA,
      fileHash: {
        normalFile: { state: 'hashed' },
        directoryInput: { state: 'degraded', reason: 'file-hash-not-file' },
        missingPath: { state: 'degraded', reason: 'file-hash-file-missing' },
        permissionFailure: { state: 'degraded', reason: 'file-hash-permission-denied' },
        noWrites: true
      },
      fileBase64: {
        normalFile: { state: 'encoded' },
        directoryInput: { state: 'degraded', reason: 'file-base64-not-file' },
        missingPath: { state: 'degraded', reason: 'file-base64-file-missing' },
        permissionFailure: { state: 'degraded', reason: 'file-base64-permission-denied' },
        sizeLimit: { state: 'degraded', reason: 'file-base64-too-large' },
        noDecodeToTempFile: true,
        noRawBase64Payload: true
      },
      recentDownload: {
        found: { state: 'found' },
        emptyDownloads: { state: 'degraded', reason: 'recent-download-empty' },
        permissionFailure: { state: 'degraded', reason: 'recent-download-permission-denied' },
        duplicateMoveTarget: {
          state: 'degraded',
          reason: 'recent-download-move-target-exists'
        },
        explicitAbsoluteMoveTarget: {
          state: 'moved',
          explicitAbsoluteTarget: true,
          overwriteExisting: false
        }
      },
      commonDirectory: {
        allowedIds: ['desktop', 'downloads', 'documents', 'app-data', 'logs'],
        noArbitraryPath: true,
        rejectsUnsupported: true
      },
      pathFormat: {
        raw: true,
        shell: true,
        fileUrl: true,
        windowsWslVariants: true,
        noExistenceRequired: true,
        openedPath: false,
        wroteClipboard: false
      },
      tempWorkspace: {
        rootUnderTuffQuickOpsTemp: true,
        noWriteOutsideWorkspace: true,
        textFile: {
          state: 'created',
          underWorkspace: true,
          opened: false,
          wroteClipboard: false
        },
        directory: {
          state: 'created',
          underWorkspace: true,
          opened: false,
          wroteClipboard: false
        }
      },
      redaction: {
        noRawHomePath: true,
        noRawUserDataPath: true,
        noFileContents: true
      },
      gate: {
        passed: true
      },
      ...overrides
    })
  }

  function buildConfirmationPolicyArtifact(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema: QUICK_OPS_CONFIRMATION_POLICY_SCHEMA,
      confirmation: {
        capturedRequireConfirmTargets: [...QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS],
        realUserSurface: true,
        beforeExecution: true,
        notMetadataOnly: true,
        visualArtifacts: [
          'evidence/quickops/confirm-keep-awake.png',
          'evidence/quickops/confirm-temp-file.png',
          'evidence/quickops/confirm-cancel.mp4'
        ],
        stateAction: {
          targetId: 'keep-awake',
          confirmCaptured: true,
          cancelCaptured: true,
          beforeExecution: true,
          confirmationTokenIssuedOnConfirm: true,
          noDispatchOnCancel: true
        },
        fileAction: {
          targetId: 'temp-text-file',
          confirmCaptured: true,
          cancelCaptured: true,
          beforeExecution: true,
          confirmationTokenIssuedOnConfirm: true,
          noDispatchOnCancel: true
        }
      },
      highRisk: {
        truePortKill: {
          executed: false,
          directExecutionAvailable: false,
          copyOnlyCommand: true,
          highRiskPolicyGate: true
        },
        bulkRename: {
          availableByDefault: false,
          executed: false,
          reason: 'bulk-rename-unavailable'
        },
        fileCleanup: {
          availableByDefault: false,
          executed: false,
          reason: 'file-cleanup-unavailable'
        },
        longTermSystemSettings: {
          availableByDefault: false,
          executed: false,
          reason: 'long-term-system-settings-unavailable'
        }
      },
      policy: {
        enterpriseOrAdminPolicyApplied: true,
        disabledReasons: [
          'stateful-tools-disabled-by-policy',
          'network-tools-disabled-by-policy',
          'file-tools-disabled-by-policy',
          'system-tools-disabled-by-policy',
          'developer-tools-disabled-by-policy',
          'high-risk-tools-disabled-by-policy'
        ],
        noToolExecutionWhenDisabled: true,
        diagnosticVisibility: {
          capabilitySummaryVisible: true,
          degradedReasonsVisible: true,
          readonlyDiagnosticsVisible: true
        }
      },
      redaction: {
        noPayloadValues: true,
        noClipboardContents: true,
        noFileContents: true,
        noRawHomePath: true
      },
      gate: {
        passed: true
      },
      ...overrides
    })
  }

  function buildFlowAiAdapterAuditArtifact(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema: QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA,
      flow: {
        expectedTargets: [...QUICK_OPS_FLOW_AI_EXPECTED_TARGETS],
        registeredTargets: [...QUICK_OPS_FLOW_AI_EXPECTED_TARGETS],
        allTargetsRegistered: true,
        requireConfirmTargets: [...QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS],
        expectedRequireConfirmTargets: [...QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS],
        requireConfirmMatchesExpected: true,
        structuredDispatchCoverage: {
          readOnly: true,
          stateful: true,
          fileWriting: true,
          notification: true,
          clipboard: true,
          folderOpen: true
        },
        policyBlockedReasons: [
          'stateful-tools-disabled-by-policy',
          'network-tools-disabled-by-policy',
          'file-tools-disabled-by-policy',
          'system-tools-disabled-by-policy',
          'developer-tools-disabled-by-policy'
        ],
        coversPolicyBlockedAck: true,
        recordsAuditWithoutPayloadValues: true,
        redactsClipboardAck: true,
        exposesDegradedAck: true
      },
      confirmation: {
        flowBusRequiresOneTimeToken: true,
        flowBusConsumesConfirmationToken: true,
        selectorRequestsConfirmationToken: true,
        selectorSeparatesConfirmationFromConsent: true
      },
      ai: {
        hasNaturalLanguageAdapter: true,
        adapterSignals: [
          'plugins/touch-quickops/index.js:flow-dispatch-adapter',
          'plugins/touch-quickops/index.test.cjs:contract'
        ],
        linksRequestTargetConfirmationResult: true,
        blocksHighRiskWithoutConfirmation: true,
        hasRuntimeDispatchBridge: true
      },
      gate: { passed: true },
      ...overrides
    })
  }

  function buildSurfaceAuditArtifact(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema: QUICK_OPS_SURFACE_AUDIT_SCHEMA,
      transport: {
        registeredEvents: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS],
        onlyExpectedTypedEvents: true
      },
      flow: {
        usesRegistry: true,
        usesQuickOpsPluginId: true,
        singleDeliveryHandler: true
      },
      sdk: {
        transportSdkMethods: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS],
        pluginSdkMethods: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS],
        pluginRuntimeMethods: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS],
        transportSdkUsesTypedEvents: true,
        pluginSdkUsesTypedEvents: true,
        pluginRuntimeUsesTypedEvents: true,
        exposesForbiddenExecutionMethods: false
      },
      forbiddenSurfaceHits: [],
      gate: { passed: true },
      ...overrides
    })
  }

  it('builds a pending manifest covering every required QuickOps evidence case', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })

    expect(manifest.schema).toBe(QUICK_OPS_EVIDENCE_SCHEMA)
    expect(manifest.baselineVersion).toBe('2.4.12-beta.8')
    expect(manifest.cases.map((item) => item.id)).toEqual(
      QUICK_OPS_EVIDENCE_CASES.map((evidenceCase) => evidenceCase.id)
    )
    expect(manifest.cases.every((item) => item.status === 'pending')).toBe(true)
    expect(manifest.verification?.recommendedCommand).toContain(
      'quickops:evidence:verify -- --input "evidence/quickops/quickops-evidence-manifest.json"'
    )
    expect(manifest.verification?.recommendedCommand).toContain('--requireCheckedEvidence')
  })

  it('fails strict verification for pending cases, missing artifacts, and unchecked evidence', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })

    expect(
      verifyQuickOpsEvidenceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true
      })
    ).toEqual({
      passed: false,
      failures: expect.arrayContaining([
        'QuickOps evidence case is not passed: quickops-packaged-session-cleanup',
        'QuickOps evidence case has no artifact path: quickops-packaged-session-cleanup',
        'QuickOps evidence case has no screenshot or recording artifact: quickops-screen-clean-visual',
        'QuickOps evidence case is missing required evidence check: quickops-packaged-session-cleanup -> Packaged artifact version matches the manifest baseline'
      ])
    })
  })

  it('requires real confirmation, high-risk boundary, platform, and AI adapter evidence cases', () => {
    expect(QUICK_OPS_EVIDENCE_CASES.map((evidenceCase) => evidenceCase.id)).toEqual([
      'quickops-packaged-session-cleanup',
      'quickops-screen-clean-visual',
      'quickops-platform-readonly',
      'quickops-files-and-temp',
      'quickops-confirmation-and-policy',
      'quickops-sdk-transport-surface',
      'quickops-flow-ai-adapter'
    ])

    const confirmation = QUICK_OPS_EVIDENCE_CASES.find(
      (evidenceCase) => evidenceCase.id === 'quickops-confirmation-and-policy'
    )
    const packaged = QUICK_OPS_EVIDENCE_CASES.find(
      (evidenceCase) => evidenceCase.id === 'quickops-packaged-session-cleanup'
    )
    const aiAdapter = QUICK_OPS_EVIDENCE_CASES.find(
      (evidenceCase) => evidenceCase.id === 'quickops-flow-ai-adapter'
    )
    const platform = QUICK_OPS_EVIDENCE_CASES.find(
      (evidenceCase) => evidenceCase.id === 'quickops-platform-readonly'
    )
    const filesAndTemp = QUICK_OPS_EVIDENCE_CASES.find(
      (evidenceCase) => evidenceCase.id === 'quickops-files-and-temp'
    )
    const sdkTransport = QUICK_OPS_EVIDENCE_CASES.find(
      (evidenceCase) => evidenceCase.id === 'quickops-sdk-transport-surface'
    )

    expect(confirmation?.requiredEvidence).toEqual(
      expect.arrayContaining([
        'Confirmation/policy artifact uses quickops-confirmation-policy/v1 schema',
        'Every requireConfirm target shows a real user confirmation surface before execution',
        'True port kill remains disabled or separately gated by high-risk policy',
        'Enterprise policy can disable QuickOps tools without removing diagnostic visibility'
      ])
    )
    expect(packaged?.requiredEvidence).toEqual(
      expect.arrayContaining([
        'Packaged cleanup artifact uses quickops-packaged-session-cleanup/v1 schema',
        'Packaged artifact version matches the manifest baseline',
        'App quit releases display and system power blockers'
      ])
    )
    expect(aiAdapter?.requiredEvidence).toEqual(
      expect.arrayContaining([
        'AI natural-language adapter maps user text to the intended QuickOps target and parameters',
        'AI requests that imply high-risk actions stop at confirmation or blocked policy state'
      ])
    )
    expect(platform?.requiredEvidence).toContain(
      'Platform artifacts use quickops-platform-readonly/v1 schema for macOS, Windows, and Linux'
    )
    expect(platform?.requiredEvidence).toContain(
      'macOS, Windows, and Linux results are separated by platform'
    )
    expect(filesAndTemp?.requiredEvidence).toContain(
      'Files/temp artifact uses quickops-files-and-temp/v1 schema'
    )
    expect(sdkTransport?.requiredEvidence).toEqual(
      expect.arrayContaining([
        'QuickOpsModule registers only canonical QuickOpsEvents typed transport handlers',
        'Plugin SDK QuickOps facade is read-only and does not expose stateful or destructive execution helpers',
        'TouchPlugin runtime quickOps facade exposes the same read-only method set and invokes only QuickOpsEvents typed transport'
      ])
    )
    expect(sdkTransport?.requiredEvidence.some((item) => item.includes('raw quick-ops'))).toBe(true)
    expect(sdkTransport?.blockedWhen).toContain(
      'A stateful or high-risk QuickOps operation is exposed through the plugin SDK or TouchPlugin runtime facade.'
    )
  })

  it('passes strict verification when every required case has matching artifacts and checks', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })

    manifest.cases = manifest.cases.map((item) => {
      const evidenceCase = QUICK_OPS_EVIDENCE_CASES.find((candidate) => candidate.id === item.id)
      return {
        ...item,
        status: 'passed',
        artifactPaths: [
          evidenceCase?.requiresVisualArtifact
            ? `evidence/quickops/${item.id}.png`
            : `evidence/quickops/${item.id}.json`
        ],
        checkedEvidence: evidenceCase?.requiredEvidence ?? []
      }
    })

    expect(
      verifyQuickOpsEvidenceManifest(manifest, {
        requireAllPassed: true,
        requireArtifactPaths: true,
        requireVisualArtifacts: true,
        requireCheckedEvidence: true
      })
    ).toEqual({
      passed: true,
      failures: []
    })
  })

  it('validates packaged session cleanup artifact content instead of trusting a checked box', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })
    const item = manifest.cases.find(
      (candidate) => candidate.id === 'quickops-packaged-session-cleanup'
    )

    expect(item).toBeDefined()
    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/packaged-session-cleanup.json',
          content: buildPackagedSessionCleanupArtifact()
        }
      ])
    ).toEqual([])

    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/packaged-session-cleanup.json',
          content: buildPackagedSessionCleanupArtifact({
            packaged: {
              isPackaged: false,
              versionMatchesManifest: true,
              isolatedUserData: false
            },
            sessionCoverage: {
              startedKinds: ['timer'],
              unsupportedKinds: []
            },
            beforeQuit: {
              visible: true,
              runningSessionCount: 1
            },
            quit: {
              normalQuit: false,
              externalKill: true
            },
            afterQuit: {
              runningSessionCount: 1,
              displayPowerBlockerActive: true,
              systemPowerBlockerActive: false,
              overlayWindowCount: 1,
              activeTimerCount: 1,
              activeStopwatchCount: 0
            },
            redaction: {
              noRuntimeObjects: false,
              noRawUserDataPath: false
            },
            gate: {
              passed: false
            }
          })
        }
      ])
    ).toEqual(
      expect.arrayContaining([
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> gate.passed is not true',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> packaged.isPackaged is not true',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> packaged.isolatedUserData is not true',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> quit.normalQuit is not true',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> quit.externalKill is not false',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> session kind is neither started nor unsupported: keep-awake',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> afterQuit.runningSessionCount is not 0',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> afterQuit.displayPowerBlockerActive is not false',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> afterQuit.overlayWindowCount is not 0',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> afterQuit.activeTimerCount is not 0',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> redaction.noRuntimeObjects is not true',
        'QuickOps packaged session cleanup artifact is invalid: evidence/quickops/packaged-session-cleanup.json -> redaction.noRawUserDataPath is not true'
      ])
    )
  })

  it('validates platform readonly artifacts across macOS, Windows, and Linux', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })
    const item = manifest.cases.find((candidate) => candidate.id === 'quickops-platform-readonly')

    expect(item).toBeDefined()
    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/platform-macos.json',
          content: buildPlatformReadonlyArtifact('macos')
        },
        {
          path: 'evidence/quickops/platform-windows.json',
          content: buildPlatformReadonlyArtifact('windows')
        },
        {
          path: 'evidence/quickops/platform-linux.json',
          content: buildPlatformReadonlyArtifact('linux')
        }
      ])
    ).toEqual([])

    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/platform-macos.json',
          content: buildPlatformReadonlyArtifact('macos', {
            collectedFromCurrentPlatform: false,
            localNetworkOnly: false,
            externalHttpRequestCount: 1,
            portStatus: { executedKill: true },
            dnsQuery: {
              usesLocalResolver: false,
              mutatedSystemDns: true
            },
            systemProxy: {
              credentialsRedacted: false
            },
            probes: {
              localIp: { state: 'passed' },
              networkStatus: { state: 'passed' },
              portStatus: { state: 'passed' },
              dnsQuery: { state: 'passed' },
              systemProxy: { state: 'passed' },
              batteryStatus: { state: 'degraded' },
              diskSpace: { state: 'unsupported' },
              directoryUsage: { state: 'passed', fakeSuccess: true }
            },
            redaction: {
              noProxyCredentials: false,
              noRawHomePath: false,
              noRawUserDataPath: false
            },
            gate: {
              passed: false
            }
          })
        }
      ])
    ).toEqual(
      expect.arrayContaining([
        'QuickOps platform readonly evidence is missing windows artifact',
        'QuickOps platform readonly evidence is missing linux artifact',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> gate.passed is not true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> collectedFromCurrentPlatform is not true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> localNetworkOnly is not true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> externalHttpRequestCount is not 0',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> portStatus.executedKill is not false',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> dnsQuery.usesLocalResolver is not true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> dnsQuery.mutatedSystemDns is not false',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> systemProxy.credentialsRedacted is not true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> probes.batteryStatus.reason is required for degraded evidence',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> probes.diskSpace.reason is required for unsupported evidence',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> probes.directoryUsage.fakeSuccess must not be true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> redaction.noProxyCredentials is not true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> redaction.noRawHomePath is not true',
        'QuickOps platform readonly artifact is invalid: evidence/quickops/platform-macos.json -> redaction.noRawUserDataPath is not true'
      ])
    )
  })

  it('validates files and temp workspace artifact content instead of trusting a checked box', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })
    const item = manifest.cases.find((candidate) => candidate.id === 'quickops-files-and-temp')

    expect(item).toBeDefined()
    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/files-and-temp.json',
          content: buildFilesAndTempArtifact()
        }
      ])
    ).toEqual([])

    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/files-and-temp.json',
          content: buildFilesAndTempArtifact({
            fileHash: {
              normalFile: { state: 'hashed' },
              directoryInput: { state: 'degraded' },
              missingPath: { state: 'degraded', reason: 'file-hash-file-missing' },
              permissionFailure: { state: 'passed' },
              noWrites: false
            },
            fileBase64: {
              normalFile: { state: 'encoded' },
              directoryInput: { state: 'degraded', reason: 'file-base64-not-file' },
              missingPath: { state: 'degraded', reason: 'file-base64-file-missing' },
              permissionFailure: { state: 'degraded', reason: 'file-base64-permission-denied' },
              sizeLimit: { state: 'passed', fakeSuccess: true },
              noDecodeToTempFile: false,
              noRawBase64Payload: false
            },
            recentDownload: {
              found: { state: 'found' },
              emptyDownloads: { state: 'degraded', reason: 'recent-download-empty' },
              permissionFailure: { state: 'degraded' },
              duplicateMoveTarget: { state: 'degraded', reason: 'recent-download-target-exists' },
              explicitAbsoluteMoveTarget: {
                state: 'moved',
                explicitAbsoluteTarget: false,
                overwriteExisting: true
              }
            },
            commonDirectory: {
              allowedIds: ['desktop', 'downloads'],
              noArbitraryPath: false,
              rejectsUnsupported: false
            },
            pathFormat: {
              raw: true,
              shell: false,
              fileUrl: true,
              windowsWslVariants: false,
              noExistenceRequired: false,
              openedPath: true,
              wroteClipboard: true
            },
            tempWorkspace: {
              rootUnderTuffQuickOpsTemp: false,
              noWriteOutsideWorkspace: false,
              textFile: {
                state: 'created',
                underWorkspace: false,
                opened: true,
                wroteClipboard: true
              },
              directory: {
                state: 'degraded'
              }
            },
            redaction: {
              noRawHomePath: false,
              noRawUserDataPath: false,
              noFileContents: false
            },
            gate: {
              passed: false
            }
          })
        }
      ])
    ).toEqual(
      expect.arrayContaining([
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> gate.passed is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> fileHash.directoryInput.reason is required',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> fileHash.permissionFailure.state is not one of degraded',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> fileHash.noWrites is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> fileBase64.sizeLimit.state is not one of degraded',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> fileBase64.noDecodeToTempFile is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> fileBase64.noRawBase64Payload is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> recentDownload.permissionFailure.reason is required',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> recentDownload.explicitAbsoluteMoveTarget.explicitAbsoluteTarget is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> recentDownload.explicitAbsoluteMoveTarget.overwriteExisting is not false',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> commonDirectory.allowedIds do not match the allowed directory set',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> commonDirectory.noArbitraryPath is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> commonDirectory.rejectsUnsupported is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> pathFormat.shell is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> pathFormat.windowsWslVariants is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> pathFormat.noExistenceRequired is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> pathFormat.openedPath is not false',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> pathFormat.wroteClipboard is not false',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> tempWorkspace.rootUnderTuffQuickOpsTemp is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> tempWorkspace.noWriteOutsideWorkspace is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> tempWorkspace.textFile.underWorkspace is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> tempWorkspace.textFile.opened is not false',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> tempWorkspace.textFile.wroteClipboard is not false',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> tempWorkspace.directory.state is not one of created/passed',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> tempWorkspace.directory.underWorkspace is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> redaction.noRawHomePath is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> redaction.noRawUserDataPath is not true',
        'QuickOps files/temp artifact is invalid: evidence/quickops/files-and-temp.json -> redaction.noFileContents is not true'
      ])
    )
  })

  it('validates confirmation and policy artifact content instead of trusting screenshots alone', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })
    const item = manifest.cases.find(
      (candidate) => candidate.id === 'quickops-confirmation-and-policy'
    )

    expect(item).toBeDefined()
    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/confirmation-policy.json',
          content: buildConfirmationPolicyArtifact()
        }
      ])
    ).toEqual([])

    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/confirmation-policy.json',
          content: buildConfirmationPolicyArtifact({
            confirmation: {
              capturedRequireConfirmTargets: ['keep-awake'],
              realUserSurface: false,
              beforeExecution: false,
              notMetadataOnly: false,
              visualArtifacts: ['evidence/quickops/flow-targets.json'],
              stateAction: {
                targetId: 'keep-awake',
                confirmCaptured: true,
                cancelCaptured: false,
                beforeExecution: true,
                confirmationTokenIssuedOnConfirm: true,
                noDispatchOnCancel: false
              },
              fileAction: {
                targetId: 'file-hash',
                confirmCaptured: false,
                cancelCaptured: true,
                beforeExecution: false,
                confirmationTokenIssuedOnConfirm: false,
                noDispatchOnCancel: true
              }
            },
            highRisk: {
              truePortKill: {
                executed: true,
                directExecutionAvailable: true,
                copyOnlyCommand: false,
                highRiskPolicyGate: false
              },
              bulkRename: {
                availableByDefault: true,
                executed: true
              },
              fileCleanup: {
                availableByDefault: true,
                executed: false,
                reason: ''
              },
              longTermSystemSettings: {
                availableByDefault: false,
                executed: true,
                reason: 'unexpected'
              }
            },
            policy: {
              enterpriseOrAdminPolicyApplied: false,
              disabledReasons: ['file-tools-disabled-by-policy'],
              noToolExecutionWhenDisabled: false,
              diagnosticVisibility: {
                capabilitySummaryVisible: false,
                degradedReasonsVisible: false,
                readonlyDiagnosticsVisible: false
              }
            },
            redaction: {
              noPayloadValues: false,
              noClipboardContents: false,
              noFileContents: false,
              noRawHomePath: false
            },
            gate: {
              passed: false
            }
          })
        }
      ])
    ).toEqual(
      expect.arrayContaining([
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> gate.passed is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.capturedRequireConfirmTargets do not match expected',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.realUserSurface is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.beforeExecution is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.notMetadataOnly is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation visual artifact is not visual: evidence/quickops/flow-targets.json',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.stateAction.cancelCaptured is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.stateAction.noDispatchOnCancel is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.fileAction.targetId is not an expected target',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.fileAction.confirmCaptured is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.fileAction.beforeExecution is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> confirmation.fileAction.confirmationTokenIssuedOnConfirm is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.truePortKill.executed is not false',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.truePortKill.directExecutionAvailable is not false',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.truePortKill is neither copy-only nor policy-gated',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.bulkRename.availableByDefault is not false',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.bulkRename.executed is not false',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.bulkRename.reason is missing',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.fileCleanup.availableByDefault is not false',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.fileCleanup.reason is missing',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> highRisk.longTermSystemSettings.executed is not false',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> policy.enterpriseOrAdminPolicyApplied is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> policy.disabledReasons do not match expected reasons',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> policy.noToolExecutionWhenDisabled is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> policy.diagnosticVisibility.capabilitySummaryVisible is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> policy.diagnosticVisibility.degradedReasonsVisible is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> policy.diagnosticVisibility.readonlyDiagnosticsVisible is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> redaction.noPayloadValues is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> redaction.noClipboardContents is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> redaction.noFileContents is not true',
        'QuickOps confirmation/policy artifact is invalid: evidence/quickops/confirmation-policy.json -> redaction.noRawHomePath is not true'
      ])
    )
  })

  it('validates SDK transport surface artifact content instead of trusting a checked box', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })
    const item = manifest.cases.find(
      (candidate) => candidate.id === 'quickops-sdk-transport-surface'
    )

    expect(item).toBeDefined()
    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/sdk-transport-surface.json',
          content: buildSurfaceAuditArtifact()
        }
      ])
    ).toEqual([])

    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/sdk-transport-surface.json',
          content: buildSurfaceAuditArtifact({
            gate: { passed: false },
            sdk: {
              transportSdkMethods: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS],
              pluginSdkMethods: [...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS],
              pluginRuntimeMethods: QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS.filter(
                (method) => method !== 'auditRecent'
              ),
              transportSdkUsesTypedEvents: true,
              pluginSdkUsesTypedEvents: true,
              pluginRuntimeUsesTypedEvents: false,
              exposesForbiddenExecutionMethods: false
            }
          })
        }
      ])
    ).toEqual(
      expect.arrayContaining([
        'QuickOps SDK/transport surface artifact is invalid: evidence/quickops/sdk-transport-surface.json -> gate.passed is not true',
        'QuickOps SDK/transport surface artifact is invalid: evidence/quickops/sdk-transport-surface.json -> pluginRuntimeMethods does not match the read-only facade contract',
        'QuickOps SDK/transport surface artifact is invalid: evidence/quickops/sdk-transport-surface.json -> pluginRuntimeUsesTypedEvents is not true'
      ])
    )
  })

  it('validates Flow/AI adapter artifact content instead of trusting a checked box', async () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })
    const item = manifest.cases.find((candidate) => candidate.id === 'quickops-flow-ai-adapter')

    expect(item).toBeDefined()
    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/flow-ai-adapter-audit.json',
          content: buildFlowAiAdapterAuditArtifact()
        }
      ])
    ).toEqual([])

    expect(
      validateQuickOpsEvidenceArtifactContents(item!, [
        {
          path: 'evidence/quickops/flow-ai-adapter-audit.json',
          content: buildFlowAiAdapterAuditArtifact({
            ai: {
              hasNaturalLanguageAdapter: true,
              adapterSignals: [
                'plugins/touch-quickops/index.js:flow-dispatch-adapter',
                'plugins/touch-quickops/index.test.cjs:contract'
              ],
              linksRequestTargetConfirmationResult: true,
              blocksHighRiskWithoutConfirmation: true,
              hasRuntimeDispatchBridge: false
            },
            gate: {
              passed: false,
              failures: ['QuickOps AI runtime dispatch bridge evidence is missing']
            }
          })
        }
      ])
    ).toEqual(
      expect.arrayContaining([
        'QuickOps Flow/AI adapter artifact is invalid: evidence/quickops/flow-ai-adapter-audit.json -> gate.passed is not true',
        'QuickOps Flow/AI adapter artifact is invalid: evidence/quickops/flow-ai-adapter-audit.json -> hasRuntimeDispatchBridge is not true'
      ])
    )
  })

  it('renders a checklist without claiming evidence is already collected', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z'
    })

    const template = renderQuickOpsEvidenceTemplate(manifest)

    expect(template).toContain('# QuickOps Evidence')
    expect(template).toContain(
      '- Use the current packaged CoreApp build for packaged/visual evidence.'
    )
    expect(template).toContain('## Screen clean and color test visual evidence')
    expect(template).toContain('## Confirmation, high-risk boundary, and policy evidence')
    expect(template).toContain('## SDK and transport surface evidence')
    expect(template).toContain(
      'pnpm -C "apps/core-app" run quickops:flow-ai:audit -- --output "evidence/quickops/flow-ai-adapter-audit.json"'
    )
    expect(template).toContain(
      'pnpm -C "apps/core-app" run quickops:surface:audit -- --output "evidence/quickops/sdk-transport-surface.json" --strict'
    )
    expect(template).toContain(
      '- [ ] QuickOpsModule registers only canonical QuickOpsEvents typed transport handlers'
    )
    expect(template).toContain(
      '- [ ] TouchPlugin runtime quickOps facade exposes the same read-only method set and invokes only QuickOpsEvents typed transport'
    )
    expect(template).toContain(
      '- [ ] True port kill remains disabled or separately gated by high-risk policy'
    )
    expect(template).toContain(
      '- [ ] AI natural-language adapter maps user text to the intended QuickOps target and parameters'
    )
    expect(template).toContain('evidence/quickops/screen-color-blue.png')
    expect(template).toContain('evidence/quickops/ai-high-risk-blocked.png')
    expect(template).toContain('- Artifact paths:\n  - _none_')
    expect(template).toContain(
      'Only Flow target metadata is attached instead of a real confirmation UI.'
    )
    expect(template).not.toContain('  - \n')
  })

  it('renders a collection plan for source-level and real packaged evidence', () => {
    const manifest = buildQuickOpsEvidenceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-19T00:00:00.000Z',
      evidenceDir: 'artifacts/quickops'
    })

    const plan = renderQuickOpsEvidenceCollectionPlan(manifest)

    expect(plan).toContain('# QuickOps Evidence Collection Plan')
    expect(plan).toContain(
      'pnpm -C "apps/core-app" run quickops:evidence:template -- --output "artifacts/quickops/quickops-evidence-manifest.json" --writeChecklist --writePlan'
    )
    expect(plan).toContain(
      'pnpm -C "apps/core-app" run quickops:surface:audit -- --output "artifacts/quickops/sdk-transport-surface.json" --strict'
    )
    expect(plan).toContain(
      'pnpm -C "apps/core-app" run quickops:flow-ai:audit -- --output "artifacts/quickops/flow-ai-adapter-audit.json" --strict'
    )
    expect(plan).toContain('These commands produce required source-level artifacts.')
    expect(plan).toContain(
      'They do not replace packaged, platform, visual, or real confirmation UI evidence.'
    )
    expect(plan).toContain('### Packaged session cleanup and quit')
    expect(plan).toContain(
      'Launch the current packaged CoreApp build with an isolated userData profile.'
    )
    expect(plan).toContain('### Screen clean and color test visual evidence')
    expect(plan).toContain('evidence/quickops/screen-clean-stop.mp4')
    expect(plan).toContain('### Confirmation, high-risk boundary, and policy evidence')
    expect(plan).toContain(
      'Every requireConfirm target shows a real user confirmation surface before execution'
    )
    expect(plan).toContain(manifest.verification?.recommendedCommand)
    expect(plan).toContain(
      'The verifier parses structured packaged cleanup, platform readonly, SDK/transport, and Flow/AI artifacts'
    )
  })

  it('writes the manifest by default when checklist or collection plan output is requested', () => {
    expect(
      resolveQuickOpsEvidenceTemplateOutputPaths({
        evidenceDir: 'artifacts/quickops/',
        writeChecklist: false,
        writePlan: false,
        pretty: true
      })
    ).toEqual({
      evidenceDir: 'artifacts/quickops',
      manifestPath: 'artifacts/quickops/quickops-evidence-manifest.json',
      writesManifest: false
    })

    expect(
      resolveQuickOpsEvidenceTemplateOutputPaths({
        evidenceDir: 'artifacts/quickops/',
        writeChecklist: true,
        writePlan: true,
        pretty: true
      })
    ).toMatchObject({
      evidenceDir: 'artifacts/quickops',
      manifestPath: 'artifacts/quickops/quickops-evidence-manifest.json',
      writesManifest: true
    })

    expect(
      resolveQuickOpsEvidenceTemplateOutputPaths({
        evidenceDir: 'artifacts/quickops',
        output: 'custom/manifest.json',
        writeChecklist: false,
        writePlan: false,
        pretty: true
      })
    ).toMatchObject({
      manifestPath: 'custom/manifest.json',
      writesManifest: true
    })
  })
})
