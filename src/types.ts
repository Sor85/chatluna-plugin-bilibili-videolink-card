export interface VideoTarget {
  kind: 'video'
  id: string
  page: number
}

export type Target = VideoTarget | { kind: 'short'; url: string }

export interface VideoInfo {
  aid: number
  bvid: string
  cid: number
  page: number
  part: string
  title: string
  description: string
  cover: string
  duration: number
  published: number
  owner: { name: string; avatar: string }
  stat: { view: number; like: number; coin: number; favorite: number; share: number; reply: number }
}

export interface Comment {
  name: string
  avatar: string
  level?: number
  message: string
  emotes: Record<string, { url: string }>
  likes: number
  published: number
}

export interface CardDetails {
  danmaku: string[]
  comments: Comment[]
  tags: string[]
  online?: string
}

export interface VideoSource {
  url: string
  size: number
}

export interface Log {
  warn(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
}
