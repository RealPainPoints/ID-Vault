import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Button, IconButton, Modal, Toasts, Toggle } from './UI'

describe('shared renderer controls', () => {
  it('renders a labeled icon-only button', () => {
    const markup = renderToStaticMarkup(
      createElement(IconButton, {
        label: 'Close vault',
        children: createElement('span', null, '×')
      })
    )

    expect(markup).toContain('aria-label="Close vault"')
    expect(markup).toContain('title="Close vault"')
    expect(markup).toContain('class="icon-button')
  })

  it('keeps button variants and native attributes intact', () => {
    const markup = renderToStaticMarkup(
      createElement(
        Button,
        { tone: 'primary', compact: true, disabled: true, type: 'submit' },
        'Save'
      )
    )

    expect(markup).toContain('button-primary')
    expect(markup).toContain('button-compact')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('type="submit"')
  })

  it('exposes toggle state as an accessible switch and requests the inverse state', () => {
    const onChange = vi.fn()
    const element = Toggle({ checked: true, onChange, label: 'Mask sensitive values' }) as ReactElement<{
      onClick: () => void
    }>
    const markup = renderToStaticMarkup(element)

    expect(markup).toContain('role="switch"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('aria-label="Mask sensitive values"')

    element.props.onClick()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('gives modals an accessible title and disables closing while busy', () => {
    const markup = renderToStaticMarkup(
      createElement(
        Modal,
        {
          title: 'Export vault',
          description: 'Create an encrypted archive.',
          dismissible: false,
          onClose: vi.fn(),
          children: createElement('p', null, 'Export content')
        }
      )
    )

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    const titleId = markup.match(/aria-labelledby="([^"]+)"/)?.[1]
    expect(titleId).toBeTruthy()
    expect(markup).toContain(`<h2 id="${titleId}">Export vault</h2>`)
    expect(markup).toContain('aria-label="Close"')
    expect(markup).toContain('disabled=""')
  })

  it('announces toast messages without interrupting the user', () => {
    const markup = renderToStaticMarkup(
      createElement(Toasts, {
        toasts: [
          { id: 1, message: 'Tax ID copied', tone: 'success' },
          { id: 2, message: 'Import failed', tone: 'error' }
        ]
      })
    )

    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('toast-success')
    expect(markup).toContain('Tax ID copied')
    expect(markup).toContain('toast-error')
    expect(markup).toContain('Import failed')
  })
})
