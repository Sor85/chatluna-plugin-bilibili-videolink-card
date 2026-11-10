import { h } from '@satorijs/core'
import type { Config } from './config'
import { videoUrl } from './card'
import { BUFFERED_VIDEO } from './media'
import { type BilibiliClient, MediaTooLargeError } from './network'
import type { CardRenderer } from './card'
import type { Log, Target, VideoInfo } from './types'

export interface Delivery {
  scope: string
  platform: string
  botId: string
  botName: string
  send(content: h[]): Promise<string[]>
  recall(id: string): Promise<void>
}

interface Task {
  targets: Target[]
  delivery: Delivery
}

export class VideoQueue {
  private pending: Task[] = []
  private running = false
  private timer?: ReturnType<typeof setTimeout>
  private processed = new Map<string, number>()

  constructor(
    private config: Config,
    private client: Pick<BilibiliClient, 'resolve' | 'info' | 'details' | 'source' | 'download'>,
    private renderer: Pick<CardRenderer, 'render'>,
    private logger: Log,
    private signal: AbortSignal
  ) {}

  enqueue(targets: Target[], delivery: Delivery): boolean {
    if (this.signal.aborted || targets.length === 0 || this.config.outputs.length === 0) return false
    if (this.pending.length >= this.config.queueLimit) {
      this.logger.warn('Video queue is full; message skipped')
      return false
    }
    this.pending.push({ targets: targets.slice(0, this.config.parseLimit), delivery })
    if (!this.running && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined
        void this.drain()
      }, this.config.bufferDelay * 1000)
    }
    return true
  }

  dispose(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.pending = []
    this.processed.clear()
  }

  private async drain(): Promise<void> {
    this.running = true
    try {
      while (this.pending.length && !this.signal.aborted) {
        const task = this.pending.shift()
        if (!task) break
        for (const target of task.targets) {
          if (this.signal.aborted) break
          try {
            const info = await this.client.info(await this.client.resolve(target))
            this.signal.throwIfAborted()
            const now = Date.now()
            for (const [key, expires] of this.processed) if (expires <= now) this.processed.delete(key)
            const key = `${task.delivery.scope}:${info.bvid}:${info.page}`
            if (this.processed.has(key)) {
              if (this.config.debug) this.logger.debug('Duplicate video skipped: %s', info.bvid)
              continue
            }
            if (await this.process(info, task.delivery)) {
              if (this.config.cooldown > 0) this.processed.set(key, Date.now() + this.config.cooldown * 1000)
              // Bound cooldown memory independently of message traffic.
              if (this.processed.size > 4096) {
                const oldest = this.processed.keys().next().value
                if (oldest !== undefined) this.processed.delete(oldest)
              }
            }
          } catch (error) {
            if (this.signal.aborted) break
            this.logger.warn('Video processing failed: %s', error instanceof Error ? error.message : 'unknown')
            if (this.config.showError) {
              try { await this.send(task.delivery, [h.text('视频解析失败，视频可能不存在、受访问限制或接口暂不可用')]) }
              catch { this.logger.warn('Video error message could not be delivered') }
            }
          }
        }
      }
    } finally {
      this.running = false
    }
  }

  private async send(delivery: Delivery, content: h[]): Promise<string[]> {
    this.signal.throwIfAborted()
    const ids = await delivery.send(content)
    if (!ids.length) throw new Error('Message was not delivered')
    return ids
  }

  private async process(info: VideoInfo, delivery: Delivery): Promise<boolean> {
    const waiting: string[] = []
    try {
      if (this.config.waitTip) waiting.push(...await this.send(delivery, [h.text(this.config.waitTip)]))
      const needsVideo = this.config.outputs.some((output) => output === 'video' || output === 'link')
      const durationTip = !needsVideo ? undefined
        : info.duration < this.config.minDuration * 60 ? this.config.shortTip
        : this.config.maxDuration > 0 && info.duration > this.config.maxDuration * 60 ? this.config.longTip
        : undefined
      if (durationTip !== undefined && this.config.filterAction === 'silent') return false
      const parts: h[][] = []
      let successful = durationTip !== undefined
      if (this.config.outputs.includes('card') && (durationTip === undefined || this.config.filterAction === 'card')) {
        try {
          const card = await this.renderer.render(info, await this.client.details(info), this.config)
          this.signal.throwIfAborted()
          parts.push([h.image(card, 'image/png'), ...(this.config.showLink ? [h.text(`\n${videoUrl(info, this.config.idPreference)}`)] : [])])
          successful = true
        } catch (error) {
          this.signal.throwIfAborted()
          this.logger.warn('Video card rendering failed: %s', error instanceof Error ? error.message : 'unknown')
          if (this.config.showError) parts.push([h.text('视频图片卡片生成失败')])
        }
      }
      if (durationTip !== undefined) {
        if (durationTip) parts.push([h.text(durationTip)])
      } else if (needsVideo) {
        try {
          const source = await this.client.source(info)
          if (this.config.outputs.includes('video')) {
            const video = this.config.downloadVideo
              ? h.video(await this.client.download(source), 'video/mp4')
              : h.video(source.url)
            if (this.config.downloadVideo && delivery.platform === 'onebot') video.attrs[BUFFERED_VIDEO] = true
            parts.push([video])
          }
          if (this.config.outputs.includes('link')) parts.push([h.text(source.url)])
          successful = true
        } catch (error) {
          this.signal.throwIfAborted()
          if (error instanceof MediaTooLargeError) {
            if (this.config.filterAction === 'silent') return false
            if (this.config.filterAction === 'notice') parts.length = 0
            if (this.config.sizeTip) parts.push([h.text(this.config.sizeTip)])
            successful = true
          } else {
            this.logger.warn('Video stream unavailable: %s', error instanceof Error ? error.message : 'unknown')
            if (this.config.showError) parts.push([h.text('视频流获取失败，图片卡片不受影响')])
          }
        }
      }
      this.signal.throwIfAborted()
      if (this.config.outputs.includes('log')) this.logger.info('Parsed video %s: %s', info.bvid, info.title)
      if (parts.length && this.config.forward && delivery.platform === 'onebot') {
        await this.send(delivery, [h('figure', {}, parts.map((children) => h('message', {
          userId: delivery.botId, nickname: delivery.botName
        }, children)))])
      } else {
        for (const part of parts) await this.send(delivery, part)
      }
      return (successful && parts.length > 0) || this.config.outputs.includes('log')
    } finally {
      for (const id of waiting) {
        try { await delivery.recall(id) } catch { this.logger.warn('Waiting message could not be recalled') }
      }
    }
  }
}
