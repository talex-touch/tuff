'use strict'

const process = require('node:process')
const { loadNativeBinding } = require('./native-loader')

const { nativeBinding, loadError } = loadNativeBinding({
  baseDir: __dirname,
  moduleName: 'tuff_native_audio',
  expectedExports: ['getNativeAudioSupport', 'startCapture', 'pollCapture', 'snapshotCapture', 'drainCapture', 'stopCapture', 'cancelCapture', 'playAudio', 'stopPlayback', 'isAccessibilityTrusted', 'typeText'],
})

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_AUDIO'

function isDisabledByEnv() {
  return process.env[DISABLE_FLAG] === '1'
}

function getNativeAudioSupport() {
  if (isDisabledByEnv()) {
    return {
      supported: false,
      platform: process.platform,
      reason: 'disabled-by-env',
    }
  }

  if (!nativeBinding || typeof nativeBinding.getNativeAudioSupport !== 'function') {
    return {
      supported: false,
      platform: process.platform,
      reason: loadError instanceof Error ? loadError.message : 'native-module-not-loaded',
    }
  }

  return nativeBinding.getNativeAudioSupport()
}

function createUnavailableError() {
  const error = new Error(
    loadError instanceof Error
      ? `Native audio module is unavailable: ${loadError.message}`
      : 'Native audio module is unavailable',
  )
  error.code = 'ERR_NATIVE_AUDIO_UNAVAILABLE'
  return error
}

function requireBinding(name) {
  if (isDisabledByEnv()) {
    const error = new Error('Native audio is disabled by TUFF_DISABLE_NATIVE_AUDIO=1')
    error.code = 'ERR_NATIVE_AUDIO_DISABLED'
    throw error
  }

  if (!nativeBinding || typeof nativeBinding[name] !== 'function') {
    throw createUnavailableError()
  }

  return nativeBinding[name]
}

function startCapture(options) {
  return requireBinding('startCapture')(options ?? undefined)
}

function pollCapture(sessionId) {
  const state = requireBinding('pollCapture')(sessionId)
  // Normalize the optional native field to an explicit `null` while active.
  return {
    active: state.active,
    durationMs: state.durationMs,
    stoppedReason: state.stoppedReason ?? null,
  }
}

function snapshotCapture(sessionId) {
  return requireBinding('snapshotCapture')(sessionId)
}

function drainCapture(sessionId) {
  return requireBinding('drainCapture')(sessionId)
}

function stopCapture(sessionId) {
  return requireBinding('stopCapture')(sessionId)
}

function cancelCapture(sessionId) {
  return requireBinding('cancelCapture')(sessionId)
}

function playAudio(bytes) {
  // Best-effort playback: degrade to a no-op id when the binding is missing or
  // disabled (so callers that don't guard don't fail); a present binding still
  // throws on undecodable audio so real errors surface.
  if (isDisabledByEnv() || !nativeBinding || typeof nativeBinding.playAudio !== 'function') {
    return { playbackId: '' }
  }
  return nativeBinding.playAudio(bytes)
}

function stopPlayback(playbackId) {
  // Best-effort: if the binding is missing/disabled there is nothing to stop.
  if (isDisabledByEnv()) {
    return
  }
  if (!nativeBinding || typeof nativeBinding.stopPlayback !== 'function') {
    return
  }
  nativeBinding.stopPlayback(playbackId ?? undefined)
}

function isAccessibilityTrusted() {
  // Best-effort probe: an unavailable binding can't type, so report not-trusted.
  if (isDisabledByEnv()) {
    return false
  }
  if (!nativeBinding || typeof nativeBinding.isAccessibilityTrusted !== 'function') {
    return false
  }
  return nativeBinding.isAccessibilityTrusted()
}

function typeText(text) {
  // Never throws: reports failure through the { ok, reason } contract.
  if (isDisabledByEnv()) {
    return { ok: false, reason: 'disabled-by-env' }
  }
  if (!nativeBinding || typeof nativeBinding.typeText !== 'function') {
    return {
      ok: false,
      reason: loadError instanceof Error ? loadError.message : 'native-module-not-loaded',
    }
  }
  return nativeBinding.typeText(text)
}

module.exports = {
  getNativeAudioSupport,
  startCapture,
  pollCapture,
  snapshotCapture,
  drainCapture,
  stopCapture,
  cancelCapture,
  playAudio,
  stopPlayback,
  isAccessibilityTrusted,
  typeText,
}
