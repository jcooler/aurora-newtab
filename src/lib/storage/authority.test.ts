import { describe, expect, it, vi } from 'vitest'
import {
  createInProcessStorageAuthority,
  createWebLockStorageAuthority,
} from './authority'

function fakeLockManager(
  request: (
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<unknown>,
  ) => Promise<unknown>,
): Pick<LockManager, 'request'> {
  return { request: request as LockManager['request'] }
}

describe('Web Lock storage authority', () => {
  it('requests the stable global lock in exclusive mode', async () => {
    const request = vi.fn(async (
      _name: string,
      _options: LockOptions,
      work: LockGrantedCallback<unknown>,
    ) => work({ name: 'aurora:storage:mutation:v1', mode: 'exclusive' }))
    const authority = createWebLockStorageAuthority(fakeLockManager(request))

    await expect(authority.runExclusive(async () => 'done')).resolves.toBe('done')
    expect(request).toHaveBeenCalledWith(
      'aurora:storage:mutation:v1',
      { mode: 'exclusive' },
      expect.any(Function),
    )
  })

  it('fails explicitly and never invokes work when Web Locks are unavailable', async () => {
    const work = vi.fn(async () => undefined)

    await expect(createWebLockStorageAuthority(undefined).runExclusive(work))
      .rejects.toThrow('Tab Two storage requires the Web Locks API')
    expect(work).not.toHaveBeenCalled()
  })

  it('propagates request rejection and allows a later retry', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('lock request failed'))
      .mockImplementationOnce(async (
        _name: string,
        _options: LockOptions,
        work: LockGrantedCallback<unknown>,
      ) => work({ name: 'aurora:storage:mutation:v1', mode: 'exclusive' }))
    const authority = createWebLockStorageAuthority(fakeLockManager(request))

    await expect(authority.runExclusive(async () => 'first')).rejects.toThrow('lock request failed')
    await expect(authority.runExclusive(async () => 'second')).resolves.toBe('second')
  })
})

describe('in-process storage authority', () => {
  it('admits one callback at a time and recovers after callback rejection', async () => {
    const authority = createInProcessStorageAuthority()
    const entered: string[] = []
    let releaseFirst = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = authority.runExclusive(async () => {
      entered.push('first')
      await firstGate
      throw new Error('first failed')
    })
    const second = authority.runExclusive(async () => {
      entered.push('second')
      return 'second complete'
    })

    await vi.waitFor(() => expect(entered).toEqual(['first']))
    releaseFirst()
    await expect(first).rejects.toThrow('first failed')
    await expect(second).resolves.toBe('second complete')
    expect(entered).toEqual(['first', 'second'])
  })
})
