import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyText } from './clipboard'

describe('copyText', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('copies via execCommand and cleans up the textarea', () => {
    const exec = vi.fn(() => true)
    // jsdom has no execCommand; define it for the test.
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec

    const result = copyText('hello world')

    expect(result).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull() // removed
  })

  it('returns false when copying fails', () => {
    ;(document as unknown as { execCommand: () => boolean }).execCommand = () => {
      throw new Error('blocked')
    }
    expect(copyText('x')).toBe(false)
  })
})
