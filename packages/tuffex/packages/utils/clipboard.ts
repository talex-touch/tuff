/**
 * Puts `text` on the clipboard: through `navigator.clipboard`, or where that is missing, as on an
 * insecure origin, through a hidden textarea and the copy command. Rejects when neither copies.
 */
export async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    if (!document.execCommand('copy'))
      throw new Error('Copy command failed')
  }
  finally {
    // Detached even when select() or the copy command throws, so a failed copy never orphans a
    // node on <body>, least of all one holding a secret.
    document.body.removeChild(textarea)
  }
}
