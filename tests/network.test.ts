import { describe, expect, it, vi } from 'vitest'
import { Config } from '../src/config'
import { BilibiliClient, MediaTooLargeError, parseVideo, readBytes, trustedMedia } from '../src/network'
import { apiVideo, info, logger } from './fixtures'

const config = Config.parse({ requestTimeout: 1, downloadTimeout: 1 })
const target = { kind: 'video', id: info.bvid, page: 1 } satisfies Parameters<BilibiliClient['info']>[0]
const controller = new AbortController()
const json = (data: unknown, code = 0) => new Response(JSON.stringify({ code, data }))

function client(fetch: typeof globalThis.fetch, signal = controller.signal) {
  return new BilibiliClient(config, fetch, signal, logger())
}

describe('官方接口与分 P', () => {
  it('AV 查询官方元数据，分 P 使用对应 CID 与时长', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      expect(String(input)).toContain('aid=170001')
      return json(apiVideo)
    })
    const result = await client(fetch).info({ ...target, id: 'av170001', page: 2 })
    expect(result).toMatchObject({ bvid: info.bvid, cid: 222, page: 2, duration: 25, part: '第二 P' })
  })
  it('拒绝不存在的 P 和无效 API 数据', () => {
    expect(() => parseVideo(apiVideo, { ...target, page: 3 })).toThrow('page')
    expect(() => parseVideo({ ...apiVideo, bvid: 'invalid' }, target)).toThrow('identifier')
  })
  it('官方错误码不伪装为空结果', async () => {
    await expect(client(async () => json({}, -404)).info(target)).rejects.toThrow('-404')
  })
  it('附加接口失败不妨碍其余卡片信息', async () => {
    const result = await client(async () => json({}, -412)).details(info)
    expect(result).toEqual({ danmaku: [], comments: [], tags: [], online: undefined })
  })
  it('解析标签、评论表情、在线人数及弹幕转义', async () => {
    const result = await client(async (input) => {
      const url = String(input)
      if (url.includes('list.so')) return new Response('<i><d p="1">&lt;测试&gt; &amp;</d></i>')
      if (url.includes('archive/tags')) return json([{ tag_name: '测试' }])
      if (url.includes('online/total')) return json({ total: '100+' })
      return json({ replies: [{ member: { uname: '用户', avatar: '', level_info: { current_level: 5 } }, content: { message: '[笑]', emote: { '[笑]': { url: 'https://i0.hdslb.com/emote.png' } } }, like: 4, ctime: 123 }] })
    }).details(info)
    expect(result).toMatchObject({ danmaku: ['<测试> &'], tags: ['测试'], online: '100+', comments: [{ name: '用户', level: 5, emotes: { '[笑]': { url: 'https://i0.hdslb.com/emote.png' } } }] })
  })
  it('只接受完整单段 MP4，拒绝 DASH 或多分段', async () => {
    const source = await client(async () => json({ format: 'mp4', durl: [{ url: 'http://cdn.bilivideo.com/video.mp4', size: 100 }] })).source(info)
    expect(source.url).toBe('https://cdn.bilivideo.com/video.mp4')
    for (const data of [{ dash: {} }, { format: 'flv', durl: [{}] }, { format: 'mp4', durl: [{}, {}] }]) {
      await expect(client(async () => json(data)).source(info)).rejects.toThrow('MP4')
    }
  })
})

describe('重定向、下载和取消', () => {
  it('短链读取 Location 而不抓网页，保留分 P', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', { status: 302, headers: { location: `https://www.bilibili.com/video/${info.bvid}?p=2` } }))
    expect(await client(fetch).resolve({ kind: 'short', url: 'https://bili22.cn/abc' })).toEqual({ ...target, page: 2 })
    expect(String(fetch.mock.calls[0][0])).toBe('https://bili22.cn/abc')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('外部、内网及降级 HTTP 重定向都不跟随', async () => {
    for (const location of ['http://127.0.0.1/secret', 'https://evil.example/', 'http://b23.tv/next', 'https://b23.tv:444/next']) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', { status: 302, headers: { location } }))
      await expect(client(fetch).resolve({ kind: 'short', url: 'https://b23.tv/abc' })).rejects.toThrow('Untrusted')
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })
  it('短链循环有限跳数', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', { status: 302, headers: { location: '/abc' } }))
    await expect(client(fetch).resolve({ kind: 'short', url: 'https://b23.tv/abc' })).rejects.toThrow('Too many')
    expect(fetch).toHaveBeenCalledTimes(6)
  })
  it('限制媒体域名', () => {
    expect(trustedMedia(new URL('https://i0.hdslb.com/a'), 'image')).toBe(true)
    expect(trustedMedia(new URL('https://cn.bilivideo.com/a'), 'video')).toBe(true)
    expect(trustedMedia(new URL('https://evilbilivideo.com/a'), 'video')).toBe(false)
    expect(trustedMedia(new URL('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.2/assets/svg/1f389.svg'), 'image')).toBe(true)
    expect(trustedMedia(new URL('https://cdn.jsdelivr.net/gh/unknown/a.svg'), 'image')).toBe(false)
  })
  it('声明长度超限立即取消正文', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '100' } })
    await expect(readBytes(response, 50, controller.signal)).rejects.toBeInstanceOf(MediaTooLargeError)
    expect(cancel).toHaveBeenCalled()
  })
  it('缺失或虚假的长度不能绕过逐块检查', async () => {
    for (const headers of [{}, { 'content-length': '1' }]) {
      const response = new Response(new Uint8Array(100), { headers })
      await expect(readBytes(response, 50, controller.signal)).rejects.toBeInstanceOf(MediaTooLargeError)
    }
  })
  it('超时中断缓慢正文而不是只约束响应头', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }))
    await expect(readBytes(response, 100, AbortSignal.timeout(20))).rejects.toThrow()
    expect(cancel).toHaveBeenCalled()
  })
  it('卸载后不发起新的请求', async () => {
    const lifetime = new AbortController()
    lifetime.abort()
    const fetch = vi.fn<typeof globalThis.fetch>()
    await expect(client(fetch, lifetime.signal).info(target)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('拒绝 HTML 伪装成 MP4，接受带 ftyp 的视频', async () => {
    const source = { url: 'https://cdn.bilivideo.com/video.mp4', size: 0 }
    await expect(client(async () => new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } })).download(source)).rejects.toThrow('MP4')
    await expect(client(async () => new Response('<html>Error</html>', { headers: { 'content-type': 'video/mp4' } })).download(source)).rejects.toThrow('Invalid MP4')
    const mp4 = Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
    expect(await client(async () => new Response(mp4, { headers: { 'content-type': 'video/mp4' } })).download(source)).toEqual(mp4)
  })
})
