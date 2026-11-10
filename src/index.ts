import type { Context } from 'cordis'
import { httpFetch } from '@chatluna/utils'
import { identityOf, routeOf } from '@chatluna/satori'
import type {} from 'koishi'
import type {} from '@chatluna/chat'
import type {} from '@chatluna/ui-server'
import type {} from '@chatluna/storage-files'
import type {} from '@cordisjs/plugin-http'
import { Config } from './config'
import { extractTargets } from './links'
import { BilibiliClient } from './network'
import { CardRenderer } from './card'
import { VideoQueue } from './queue'
import { bufferedVideoEncoder } from './media'

export const name = 'chatluna-bilibili-videolink-card'
export { Config }
export const inject = ['koishi', 'http', 'chat', 'chatluna_storage']

export function apply(ctx: Context, config: Config) {
  ctx.inject(['chatluna_webui'], (ctx) => {
    ctx.chatluna_webui.addEntry({ baseUrl: import.meta.url, source: '../client/index.ts', bundle: '../dist/client.js' })
  })
  if (!config.enabled) return
  const lifetime = new AbortController()
  ctx.chat.encoder('onebot', bufferedVideoEncoder(
    (id) => ctx.chatluna_storage.readFile(id), config.maxFileSize * 1024 * 1024, lifetime.signal
  ))
  const client = new BilibiliClient(config, httpFetch(ctx.http), lifetime.signal, ctx.logger)
  const renderer = new CardRenderer(client, ctx.logger, lifetime.signal)
  const queue = new VideoQueue(config, client, renderer, ctx.logger, lifetime.signal)
  ctx.effect(() => () => {
    lifetime.abort()
    queue.dispose()
  })
  ctx.on('attach', (session) => {
    if (!session.elements || session.userId === session.selfId || session.event.user?.isBot) return
    const targets = extractTargets(session.elements, config)
    if (!targets.length) return
    const route = routeOf(identityOf(session))
    queue.enqueue(targets, {
      scope: route.id,
      platform: session.platform,
      botId: session.selfId,
      botName: session.bot.user?.name ?? session.selfId,
      send: async (content) => (await ctx.chat.send(route, content)).messageIds,
      recall: (id) => ctx.chat.recall(route, id, { notice: false })
    })
  })
}
