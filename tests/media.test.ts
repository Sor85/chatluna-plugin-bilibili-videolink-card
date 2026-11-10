import { describe, expect, it, vi } from 'vitest'
import { h } from '@satorijs/core'
import type { MediaTarget } from '@chatluna/chat'
import { BUFFERED_VIDEO, bufferedVideoEncoder } from '../src/media'

function target(marked = true): MediaTarget {
  return {
    kind: 'video', platform: 'onebot',
    media: { id: 'test', name: 'test.mp4', size: 6 * 1024 * 1024, mediaType: 'video/mp4' },
    element: h('video', { src: 'data:video/mp4;base64,', [BUFFERED_VIDEO]: marked }), note: () => {}
  }
}

describe('OneBot 已下载视频编码', () => {
  it('较大视频仍为内联数据，不把跨机器 file:// 交给适配器', async () => {
    const next = vi.fn(async () => h.video('file:///host-only.mp4'))
    const encoder = bufferedVideoEncoder(async () => ({ buffer: Buffer.from('mp4') }), 50 * 1024 * 1024, new AbortController().signal)
    const result = await encoder(target(), next)
    expect(result?.attrs['src']).toBe('data:video/mp4;base64,bXA0')
    expect(result?.attrs[BUFFERED_VIDEO]).toBeUndefined()
    expect(next).not.toHaveBeenCalled()
  })
  it('不接管其他插件的媒体', async () => {
    const next = vi.fn(async () => h.video('file:///other.mp4'))
    const read = vi.fn(async () => ({ buffer: Buffer.from('mp4') }))
    const encoder = bufferedVideoEncoder(read, 50 * 1024 * 1024, new AbortController().signal)
    await encoder(target(false), next)
    expect(next).toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })
  it('遵守视频限额及卸载取消', async () => {
    const read = vi.fn(async () => ({ buffer: Buffer.from('mp4') }))
    const lifetime = new AbortController()
    const encoder = bufferedVideoEncoder(read, 1, lifetime.signal)
    await expect(encoder(target(), async () => undefined)).rejects.toThrow('limit')
    expect(read).not.toHaveBeenCalled()
    lifetime.abort()
    await expect(encoder(target(), async () => undefined)).rejects.toThrow()
  })
})
