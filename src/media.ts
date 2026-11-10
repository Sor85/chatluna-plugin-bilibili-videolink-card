import { h } from '@satorijs/core'
import type { MediaEncoder } from '@chatluna/chat'

export const BUFFERED_VIDEO = 'bilibiliBuffered'

export function bufferedVideoEncoder(
  readFile: (id: string) => Promise<{ buffer: Buffer } | null>,
  maxBytes: number,
  signal: AbortSignal
): MediaEncoder {
  return async (target, next) => {
    if (target.kind !== 'video' || target.element.attrs[BUFFERED_VIDEO] !== true) return next()
    signal.throwIfAborted()
    if (target.media.size > maxBytes) throw new Error('Buffered video exceeds the configured limit')
    const file = await readFile(target.media.id)
    signal.throwIfAborted()
    if (!file || file.buffer.length > maxBytes) throw new Error('Buffered video is unavailable')
    // OneBot may run on another machine. Keep this plugin's downloaded bytes portable instead of file://.
    return h.video(file.buffer, target.media.mediaType)
  }
}
