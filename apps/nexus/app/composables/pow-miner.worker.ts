interface PowMineRequest {
  id: number
  proof: string
  difficulty: number
  maxAttempts?: number
}

interface PowMineResponse {
  id: number
  nonce: string
}

const DEFAULT_MAX_ATTEMPTS = 300_000
const encoder = new TextEncoder()

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle)
    return ''
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value))
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1)
    hex += bytes[i]!.toString(16).padStart(2, '0')
  return hex
}

async function mine(proof: string, difficulty: number, maxAttempts: number): Promise<string> {
  if (difficulty <= 0)
    return ''

  const prefix = '0'.repeat(difficulty)
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = attempt.toString(36)
    const digest = await sha256Hex(`${proof}${candidate}`)
    if (digest && digest.startsWith(prefix))
      return candidate
  }

  return ''
}

globalThis.addEventListener('message', async (event: MessageEvent<PowMineRequest>) => {
  const { id, proof, difficulty, maxAttempts = DEFAULT_MAX_ATTEMPTS } = event.data ?? {}
  try {
    const nonce = await mine(String(proof ?? ''), Number(difficulty ?? 0), maxAttempts)
    const response: PowMineResponse = { id, nonce }
    globalThis.postMessage(response)
  }
  catch {
    const response: PowMineResponse = { id, nonce: '' }
    globalThis.postMessage(response)
  }
})
