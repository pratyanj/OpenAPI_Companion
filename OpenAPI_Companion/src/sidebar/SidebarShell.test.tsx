import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarShell } from './SidebarShell'
import { StorageService } from '@/core/storage'
import { EventBus } from '@/core/events'
import { ThemeManager, type MediaQueryListLike } from '@/services'
import { createFakeArea } from '@/tests/fake-storage'

const noMatch: MediaQueryListLike = {
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}

async function setup() {
  const storage = new StorageService({ area: createFakeArea(), now: () => 0 })
  const bus = new EventBus()
  const theme = new ThemeManager({
    storage,
    root: document.createElement('div'),
    matchMedia: () => noMatch,
  })
  await theme.init()
  return { storage, bus, theme }
}

describe('SidebarShell', () => {
  it('renders the shell with a tablist', async () => {
    const { storage, bus, theme } = await setup()
    render(<SidebarShell project={null} theme={theme} bus={bus} storage={storage} />)
    expect(screen.getByRole('complementary', { name: 'OpenAPI Companion' })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('switches the visible panel when a tab is clicked', async () => {
    const { storage, bus, theme } = await setup()
    render(<SidebarShell project={null} theme={theme} bus={bus} storage={storage} />)

    fireEvent.click(screen.getByRole('tab', { name: /Auth/ }))
    expect(screen.getByText('Authentication')).toBeInTheDocument()
  })

  it('collapses to a launcher and expands again', async () => {
    const { storage, bus, theme } = await setup()
    render(<SidebarShell project={null} theme={theme} bus={bus} storage={storage} />)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open OpenAPI Companion' }))
    expect(screen.getByRole('complementary', { name: 'OpenAPI Companion' })).toBeInTheDocument()
  })

  it('cycles the theme preference from the header toggle', async () => {
    const { storage, bus, theme } = await setup()
    render(<SidebarShell project={null} theme={theme} bus={bus} storage={storage} />)

    fireEvent.click(screen.getByRole('button', { name: /Theme: system/ }))
    expect(await screen.findByRole('button', { name: /Theme: light/ })).toBeInTheDocument()
  })

  it('shows project details on the dashboard when identified', async () => {
    const { storage, bus, theme } = await setup()
    const project = {
      id: 'project_abc12345',
      name: 'localhost:8000',
      originUrl: 'https://localhost:8000',
      openApiUrl: 'https://localhost:8000/openapi.json',
      docType: 'swagger-ui',
      createdAt: 0,
      lastActiveEnvId: 'default',
    }
    render(<SidebarShell project={project} theme={theme} bus={bus} storage={storage} />)
    expect(screen.getByText('localhost:8000')).toBeInTheDocument()
    expect(screen.getByText('project_abc12345')).toBeInTheDocument()
  })
})
