import { isPlainObject } from '@chatluna/utils'
import type { Config } from './config'
import { trustedPage, videoTarget } from './links'
import type { CardDetails, Comment, Log, Target, VideoInfo, VideoSource, VideoTarget } from './types'

const MiB = 1024 * 1024

export class MediaTooLargeError extends Error {
  constructor() { super('Media exceeds the configured size limit') }
}

function object(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error('Invalid Bilibili response object')
  return value
}

function number(value: unknown, fallback?: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (fallback !== undefined) return fallback
  throw new Error('Invalid Bilibili numeric field')
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function parseVideo(data: unknown, target: VideoTarget): VideoInfo {
  const value = object(data)
  const pages: unknown[] = Array.isArray(value['pages']) ? value['pages'] : []
  const page = pages.map(object).find((item) => item['page'] === target.page)
  if (!page) throw new Error('Video page does not exist')
  const bvid = text(value['bvid'])
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new Error('Invalid Bilibili video identifier')
  const owner = object(value['owner'])
  const stat = object(value['stat'])
  return {
    aid: number(value['aid']), bvid, cid: number(page['cid']), page: target.page,
    part: pages.length > 1 ? text(page['part']) : '',
    title: text(value['title']), description: text(value['desc']), cover: text(value['pic']),
    duration: number(page['duration']), published: number(value['pubdate']),
    owner: { name: text(owner['name']), avatar: text(owner['face']) },
    stat: {
      view: number(stat['view'], 0), like: number(stat['like'], 0), coin: number(stat['coin'], 0),
      favorite: number(stat['favorite'], 0), share: number(stat['share'], 0), reply: number(stat['reply'], 0)
    }
  }
}

function parseComment(value: unknown): Comment {
  const comment = object(value)
  const member = object(comment['member'])
  const content = object(comment['content'])
  const emotes: Comment['emotes'] = {}
  if (isPlainObject(content['emote'])) {
    for (const [name, emote] of Object.entries(content['emote']).slice(0, 32)) {
      if (isPlainObject(emote) && typeof emote['url'] === 'string') emotes[name] = { url: emote['url'] }
    }
  }
  const level = isPlainObject(member['level_info']) ? member['level_info']['current_level'] : undefined
  return {
    name: text(member['uname']), avatar: text(member['avatar']),
    level: typeof level === 'number' ? level : undefined,
    message: text(content['message']), emotes,
    likes: number(comment['like'], 0), published: number(comment['ctime'], 0)
  }
}

export function trustedMedia(url: URL, kind: 'image' | 'video'): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const suffixes = kind === 'video' ? ['bilivideo.com', 'bilivideo.cn'] : ['hdslb.com', 'bilibili.com']
  return suffixes.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    || (kind === 'image' && url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/jdecked/twemoji@17.0.2/assets/svg/'))
}

export async function readBytes(response: Response, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new MediaTooLargeError()
  }
  if (!response.body) throw new Error('Empty HTTP response')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    signal.throwIfAborted()
    for (;;) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      size += value.length
      if (size > limit) throw new MediaTooLargeError()
      chunks.push(value)
    }
    return Buffer.concat(chunks, size)
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export class BilibiliClient {
  constructor(
    private config: Config,
    private fetch: typeof globalThis.fetch,
    private lifetime: AbortSignal,
    private logger: Log
  ) {}

  private signal(download = false): AbortSignal {
    return AbortSignal.any([
      this.lifetime, AbortSignal.timeout((download ? this.config.downloadTimeout : this.config.requestTimeout) * 1000)
    ])
  }

  private async request(url: URL, allowed: (url: URL) => boolean, signal: AbortSignal): Promise<Response> {
    for (let hop = 0; hop <= 5; hop++) {
      signal.throwIfAborted()
      if (!allowed(url)) throw new Error('Untrusted Bilibili resource URL')
      const response = await this.fetch(url, {
        redirect: 'manual', signal,
        headers: { 'User-Agent': this.config.userAgent, Referer: 'https://www.bilibili.com/' }
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) throw new Error('Missing redirect location')
        url = new URL(location, url)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`Bilibili HTTP ${response.status}`)
      }
      return response
    }
    throw new Error('Too many Bilibili redirects')
  }

  private async api(path: string, params: Record<string, string | number>): Promise<unknown> {
    const url = new URL(path, 'https://api.bilibili.com')
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
    const signal = this.signal()
    const response = await this.request(url, (url) => url.origin === 'https://api.bilibili.com', signal)
    const value = object(JSON.parse((await readBytes(response, 4 * MiB, signal)).toString('utf8')))
    if (value['code'] !== 0) throw new Error(`Bilibili API error ${text(String(value['code']))}`)
    return value['data']
  }

  async resolve(target: Target): Promise<VideoTarget> {
    if (target.kind === 'video') return target
    let url = new URL(target.url)
    const signal = this.signal()
    for (let hop = 0; hop <= 5; hop++) {
      signal.throwIfAborted()
      if (!trustedPage(url)) throw new Error('Untrusted short-link redirect')
      const video = videoTarget(url)
      if (video) return video
      const response = await this.fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': this.config.userAgent } })
      const location = response.headers.get('location')
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        await response.body?.cancel()
        url = new URL(location, url)
        continue
      }
      await response.body?.cancel()
      throw new Error('Short link does not point to a video')
    }
    throw new Error('Too many short-link redirects')
  }

  async info(target: VideoTarget): Promise<VideoInfo> {
    const params: Record<string, string> = target.id.startsWith('av') ? { aid: target.id.slice(2) } : { bvid: target.id }
    return parseVideo(await this.api('/x/web-interface/view', params), target)
  }

  async details(info: VideoInfo): Promise<CardDetails> {
    const optional = async <T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await task() } catch (error) {
        this.lifetime.throwIfAborted()
        this.logger.warn('Card detail unavailable: %s (%s)', label, error instanceof Error ? error.message : 'unknown')
        return fallback
      }
    }
    const [danmaku, comments, tags, online] = await Promise.all([
      optional('danmaku', async () => {
        const signal = this.signal()
        const response = await this.request(new URL(`https://api.bilibili.com/x/v1/dm/list.so?oid=${info.cid}`), (url) => url.origin === 'https://api.bilibili.com', signal)
        const xml = (await readBytes(response, 4 * MiB, signal)).toString('utf8')
        return [...xml.matchAll(/<d\s[^>]*>(.*?)<\/d>/gs)].slice(0, 8).map((match) =>
          match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
        )
      }, []),
      optional('comments', async () => {
        const data = object(await this.api('/x/v2/reply/main', { type: 1, oid: info.aid, next: 0, mode: 3, plat: 1 }))
        return Array.isArray(data['replies']) ? data['replies'].slice(0, 5).map(parseComment) : []
      }, []),
      optional('tags', async () => {
        const data = await this.api('/x/tag/archive/tags', { bvid: info.bvid })
        return Array.isArray(data) ? data.slice(0, 12).map((item: unknown) => text(object(item)['tag_name'])).filter(Boolean) : []
      }, []),
      optional<string | undefined>('online', async () => {
        const data = object(await this.api('/x/player/online/total', { aid: info.aid, cid: info.cid }))
        return text(data['total']) || undefined
      }, undefined)
    ])
    return { danmaku, comments, tags, online }
  }

  async source(info: VideoInfo): Promise<VideoSource> {
    const data = object(await this.api('/x/player/playurl', {
      bvid: info.bvid, cid: info.cid, qn: 32, fnval: 1, fnver: 0, fourk: 0, platform: 'html5'
    }))
    const durl = data['durl']
    if (!Array.isArray(durl) || durl.length !== 1 || !text(data['format']).startsWith('mp4')) {
      throw new Error('A complete MP4 stream is unavailable')
    }
    const media = object(durl[0])
    const url = new URL(text(media['url']))
    if (url.protocol === 'http:') url.protocol = 'https:'
    if (!trustedMedia(url, 'video')) throw new Error('Untrusted video CDN')
    return { url: url.href, size: number(media['size'], 0) }
  }

  async download(source: VideoSource): Promise<Buffer> {
    const limit = this.config.maxFileSize * MiB
    if (source.size > limit) throw new MediaTooLargeError()
    const signal = this.signal(true)
    const response = await this.request(new URL(source.url), (url) => trustedMedia(url, 'video'), signal)
    const mime = response.headers.get('content-type')?.split(';')[0]
    if (mime && !['video/mp4', 'application/octet-stream', 'binary/octet-stream'].includes(mime)) {
      await response.body?.cancel()
      throw new Error('Video CDN did not return MP4 data')
    }
    const data = await readBytes(response, limit, signal)
    if (data.length < 12 || data.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Invalid MP4 data')
    return data
  }

  async image(source: string): Promise<Buffer> {
    const url = new URL(source)
    if (url.protocol === 'http:') url.protocol = 'https:'
    const signal = this.signal()
    const response = await this.request(url, (url) => trustedMedia(url, 'image'), signal)
    const mime = response.headers.get('content-type')?.split(';')[0]
    if (!mime?.startsWith('image/')) {
      await response.body?.cancel()
      throw new Error('Image CDN did not return an image')
    }
    return readBytes(response, 5 * MiB, signal)
  }
}
