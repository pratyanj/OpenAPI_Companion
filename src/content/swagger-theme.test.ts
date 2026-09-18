import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectSwaggerTheme, syncSwaggerTheme, initSwaggerThemeSync } from './index'

describe('Swagger Theme Detection & Lightbulb Sync', () => {
  let doc: Document

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Swagger Test')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects light theme by default on clean white Swagger page', () => {
    expect(detectSwaggerTheme(doc)).toBe(false)

    const isDark = syncSwaggerTheme(doc)
    expect(isDark).toBe(false)
    expect(doc.body.classList.contains('oac-light-mode')).toBe(true)
    expect(doc.body.classList.contains('oac-dark-mode')).toBe(false)
  })

  it('detects dark theme when root or body has explicit dark class or data-theme', () => {
    doc.body.classList.add('theme-dark')
    expect(detectSwaggerTheme(doc)).toBe(true)

    syncSwaggerTheme(doc)
    expect(doc.body.classList.contains('oac-dark-mode')).toBe(true)
    expect(doc.body.classList.contains('oac-light-mode')).toBe(false)
  })

  it('detects dark theme via computed background color brightness (drf-yasg / dark extension)', () => {
    const swaggerEl = doc.createElement('div')
    swaggerEl.className = 'swagger-ui'
    doc.body.appendChild(swaggerEl)

    // Mock getComputedStyle to simulate dark background (#1b1b1b -> rgb(27, 27, 27))
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      if (el === swaggerEl || el === doc.body) {
        return {
          backgroundColor: 'rgb(27, 27, 27)',
        } as unknown as CSSStyleDeclaration
      }
      return {
        backgroundColor: 'transparent',
      } as unknown as CSSStyleDeclaration
    })

    expect(detectSwaggerTheme(doc)).toBe(true)

    syncSwaggerTheme(doc)
    expect(doc.body.classList.contains('oac-dark-mode')).toBe(true)
    expect(doc.body.classList.contains('oac-light-mode')).toBe(false)
  })

  it('syncs theme in real time when topbar lightbulb icon is clicked', () => {
    let currentBg = 'rgb(27, 27, 27)'
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      if (el === doc.body) {
        return { backgroundColor: currentBg } as unknown as CSSStyleDeclaration
      }
      return { backgroundColor: 'transparent' } as unknown as CSSStyleDeclaration
    })

    const topbar = doc.createElement('div')
    topbar.className = 'topbar'
    const bulbBtn = doc.createElement('button')
    bulbBtn.setAttribute('title', 'Toggle dark theme')
    topbar.appendChild(bulbBtn)
    doc.body.appendChild(topbar)

    const cleanup = initSwaggerThemeSync(doc)

    // Initially dark
    expect(doc.body.classList.contains('oac-dark-mode')).toBe(true)

    // User clicks bulb button to switch to light mode
    currentBg = 'rgb(255, 255, 255)'
    bulbBtn.click()

    // Immediately syncs
    expect(doc.body.classList.contains('oac-light-mode')).toBe(true)
    expect(doc.body.classList.contains('oac-dark-mode')).toBe(false)

    cleanup()
  })
})
