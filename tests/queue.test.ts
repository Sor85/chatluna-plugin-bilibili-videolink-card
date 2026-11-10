import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Config, type Config as Settings } from '../src/config'
import { MediaTooLargeError } from '../src/network'
import { type Delivery, VideoQueue } from '../src/queue'
import { details, info, logger } from './fixtures'

function setup(patch: Partial<Settings> = {}) {
  const config = Config.parse({ ...patch, bufferDelay: patch.bufferDelay ?? 0 })
  const lifetime = new AbortController()
  const client = {
    resolve: vi.fn(async () => ({ kind: 'video', id: info.bvid, page: 1 } satisfies Parameters<VideoQueue['enqueue']>[0][number])),
    info: vi.fn(async () => info), details: vi.fn(async () => details),
    source: vi.fn(async () => ({ url: 'https://cdn.bilivideo.com/video.mp4', size: 100 })),
    download: vi.fn(async () => Buffer.from('video'))
  }
  const renderer = { render: vi.fn(async () => Buffer.from('png')) }
  const send = vi.fn<Delivery['send']>(async () => ['sent'])
  const delivery: Delivery = { scope: 'bot:channel', platform: 'onebot', botId: '1000', botName: '测试机器人', send, recall: vi.fn(async () => {}) }
  const log = logger()
  const queue = new VideoQueue(config, client, renderer, log, lifetime.signal)
  const target = { kind: 'video', id: info.bvid, page: 1 } satisfies Parameters<VideoQueue['enqueue']>[0][number]
  return { queue, client, renderer, delivery, send, log, target, lifetime }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function flush() { await vi.runAllTimersAsync() }

describe('队列与去重', () => {
  it('每条消息上限实际生效', async () => {
    const s = setup({ parseLimit: 2, cooldown: 0, outputs: ['card'] })
    s.queue.enqueue([s.target, s.target, s.target], s.delivery)
    await flush()
    expect(s.client.info).toHaveBeenCalledTimes(2)
    expect(s.send).toHaveBeenCalledTimes(2)
  })
  it('缓冲按首条消息计时，不被持续输入无限推迟', async () => {
    const s = setup({ bufferDelay: 5, cooldown: 0, outputs: ['card'] })
    s.queue.enqueue([s.target], s.delivery)
    await vi.advanceTimersByTimeAsync(4000)
    s.queue.enqueue([s.target], s.delivery)
    expect(s.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.send).toHaveBeenCalledTimes(2)
  })
  it('按机器人/频道去重，过期可再次处理', async () => {
    const s = setup({ outputs: ['card'], cooldown: 10 })
    s.queue.enqueue([s.target, s.target], s.delivery)
    s.queue.enqueue([s.target], { ...s.delivery, scope: 'other-bot:channel' })
    await flush()
    expect(s.send).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10001)
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.send).toHaveBeenCalledTimes(3)
  })
  it('分 P 不互相去重', async () => {
    const s = setup({ outputs: ['card'] })
    s.client.info.mockResolvedValueOnce(info).mockResolvedValueOnce({ ...info, cid: 222, page: 2 })
    s.queue.enqueue([s.target, s.target], s.delivery)
    await flush()
    expect(s.send).toHaveBeenCalledTimes(2)
  })
  it('发送失败不进入成功去重缓存', async () => {
    const s = setup({ outputs: ['card'] })
    s.send.mockResolvedValueOnce([])
    s.queue.enqueue([s.target, s.target], s.delivery)
    await flush()
    expect(s.renderer.render).toHaveBeenCalledTimes(2)
  })
  it('仅发送错误提示不进入成功去重缓存', async () => {
    const s = setup({ outputs: ['card'], showError: true })
    s.renderer.render.mockRejectedValueOnce(new Error('render failed'))
    s.queue.enqueue([s.target, s.target], s.delivery)
    await flush()
    expect(s.renderer.render).toHaveBeenCalledTimes(2)
    expect(s.send.mock.calls.map(([parts]) => parts[0].type)).toEqual(['text', 'img'])
  })
  it('队列有界，卸载清掉缓冲任务', async () => {
    const s = setup({ bufferDelay: 5, queueLimit: 1 })
    expect(s.queue.enqueue([s.target], s.delivery)).toBe(true)
    expect(s.queue.enqueue([s.target], s.delivery)).toBe(false)
    s.lifetime.abort()
    s.queue.dispose()
    await flush()
    expect(s.client.info).not.toHaveBeenCalled()
    expect(s.queue.enqueue([s.target], s.delivery)).toBe(false)
  })
  it('没有输出时不占用队列或请求网络', async () => {
    const s = setup({ outputs: [] })
    expect(s.queue.enqueue([s.target], s.delivery)).toBe(false)
    await flush()
    expect(s.client.info).not.toHaveBeenCalled()
  })
})

describe('发送、过滤与降级', () => {
  it('仅图片模式不请求视频直链', async () => {
    const s = setup({ outputs: ['card'], showLink: true, idPreference: 'av' })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.client.source).not.toHaveBeenCalled()
    expect(s.send.mock.calls[0][0].map(String).join('')).toContain('av170001')
  })
  it('图片、视频、直链按顺序发送，不借用用户身份', async () => {
    const s = setup({ outputs: ['card', 'video', 'link'] })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.send.mock.calls.map(([parts]) => parts[0].type)).toEqual(['img', 'video', 'text'])
  })
  it('远程视频模式不下载媒体', async () => {
    const s = setup({ outputs: ['video'], downloadVideo: false })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.client.download).not.toHaveBeenCalled()
    expect(s.send.mock.calls[0][0][0].attrs['src']).toBe('https://cdn.bilivideo.com/video.mp4')
  })
  it('合并转发仅 OneBot 生效，节点使用机器人身份', async () => {
    const s = setup({ forward: true })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    const figure = s.send.mock.calls[0][0][0]
    expect(figure.type).toBe('figure')
    expect(figure.children.map((node) => node.attrs['userId'])).toEqual(['1000', '1000'])
    const other = setup({ forward: true })
    other.queue.enqueue([other.target], { ...other.delivery, platform: 'discord' })
    await flush()
    expect(other.send).toHaveBeenCalledTimes(2)
  })
  it('时长超限保留卡片且不请求视频', async () => {
    const s = setup({ maxDuration: 1 })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.client.source).not.toHaveBeenCalled()
    expect(s.send.mock.calls.map(([parts]) => parts[0].type)).toEqual(['img', 'text'])
  })
  it.each(['notice', 'silent'])('时长限制 %s 行为不生成图片', async (filterAction) => {
    const s = setup({ maxDuration: 1, filterAction: filterAction === 'notice' ? 'notice' : 'silent' })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.renderer.render).not.toHaveBeenCalled()
    expect(s.send).toHaveBeenCalledTimes(filterAction === 'notice' ? 1 : 0)
  })
  it('空提示文案仍然执行时长过滤', async () => {
    const s = setup({ maxDuration: 1, longTip: '' })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.client.source).not.toHaveBeenCalled()
    expect(s.send).toHaveBeenCalledTimes(1)
  })
  it('大小超限按策略保留卡片及提示，不发送链接', async () => {
    const s = setup({ outputs: ['card', 'video', 'link'] })
    s.client.download.mockRejectedValue(new MediaTooLargeError())
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.send.mock.calls.map(([parts]) => parts[0].type)).toEqual(['img', 'text'])
    expect(s.send.mock.calls[1][0][0].attrs['content']).toContain('大小')
  })
  it('视频接口失败不丢弃已生成图片', async () => {
    const s = setup()
    s.client.source.mockRejectedValue(new Error('network'))
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.send.mock.calls[0][0][0].type).toBe('img')
  })
  it('失败、静默过滤和正常结束都撤回全部等待消息', async () => {
    for (const mode of ['success', 'filter', 'error']) {
      const s = setup({ waitTip: '正在解析', filterAction: 'silent', maxDuration: mode === 'filter' ? 1 : 25 })
      s.send.mockResolvedValueOnce(['waiting1', 'waiting2'])
      if (mode === 'error') s.send.mockRejectedValueOnce(new Error('send failed'))
      s.queue.enqueue([s.target], s.delivery)
      await flush()
      expect(s.delivery.recall).toHaveBeenCalledWith('waiting1')
      expect(s.delivery.recall).toHaveBeenCalledWith('waiting2')
    }
  })
  it('下载期间卸载，停止发送并撤回等待消息', async () => {
    const s = setup({ waitTip: '正在解析' })
    s.client.download.mockImplementation(async () => { s.lifetime.abort(); return Buffer.from('video') })
    s.queue.enqueue([s.target], s.delivery)
    await flush()
    expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.delivery.recall).toHaveBeenCalled()
  })
})
