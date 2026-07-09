/**
 * Copy text to the clipboard. Uses a temporary textarea + `execCommand('copy')`
 * which works on plain-http pages too (where `navigator.clipboard` is blocked,
 * e.g. a LAN Swagger at http://192.168.x). Requires a user gesture. Clipboard
 * writes are always explicit (security §1.15) — never automatic.
 */
export function copyText(text: string): boolean {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    return ok
  } catch {
    return false
  }
}
