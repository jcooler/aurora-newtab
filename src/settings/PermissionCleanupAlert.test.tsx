// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PermissionCleanupAlert from './PermissionCleanupAlert'

describe('PermissionCleanupAlert', () => {
  it('renders no alert without pending origin patterns', () => {
    render(<PermissionCleanupAlert pendingPatterns={[]} onRetry={() => {}} retrying={false} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders the durable recovery action when cleanup is pending', () => {
    const onRetry = vi.fn()
    render(
      <PermissionCleanupAlert
        pendingPatterns={['https://stuck.example.com/*']}
        onRetry={onRetry}
        retrying={false}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/permission/i)
    fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('keeps the narrow recovery action at least 36px in both dimensions', () => {
    render(
      <PermissionCleanupAlert
        pendingPatterns={['https://stuck.example.com/*']}
        onRetry={() => {}}
        retrying={false}
      />,
    )
    const retry = screen.getByRole('button', { name: 'Retry permission cleanup' })
    expect(retry.className).toContain('max-[420px]:min-h-9')
    expect(retry.className).toContain('max-[420px]:min-w-9')
  })
})
