import { Schema } from '@chatluna/schema'

export type Output = 'card' | 'video' | 'link' | 'log'
export type FilterAction = 'card' | 'notice' | 'silent'

export interface Config {
  enabled: boolean
  outputs: Output[]
  waitTip: string
  parseLinks: boolean
  parseShares: boolean
  parseIds: boolean
  parseLimit: number
  formatNumbers: boolean
  forward: boolean
  showError: boolean
  showLink: boolean
  /** 只在 showLink 开启时由表单显示和解析，缺省按 BV 号处理。 */
  idPreference?: 'bv' | 'av'
  downloadVideo: boolean
  maxFileSize: number
  minDuration: number
  maxDuration: number
  filterAction: FilterAction
  shortTip: string
  longTip: string
  sizeTip: string
  cooldown: number
  bufferDelay: number
  queueLimit: number
  requestTimeout: number
  downloadTimeout: number
  userAgent: string
  debug: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enabled: Schema.boolean().label('启用解析').description('关闭后不监听消息').default(true),
    outputs: Schema.array(Schema.union([
      Schema.const('card').description('图片卡片'),
      Schema.const('video').description('视频'),
      Schema.const('link').description('视频直链'),
      Schema.const('log').description('解析日志')
    ])).role('bilibili-videolink-card:outputs').label('输出内容').default(['card', 'video']),
    waitTip: Schema.string().label('等待提示').description('处理期间发送，结束后撤回；留空不发送').default('')
  }).description('基础设置'),
  Schema.object({
    parseLinks: Schema.boolean().label('文本链接').description('视频网页链接与 b23.tv 等短链').default(true),
    parseShares: Schema.boolean().label('分享卡片').description('QQ 小程序等 JSON 分享卡片').default(true),
    parseIds: Schema.boolean().label('独立 BV / AV 号').description('以空白或标点分隔的视频编号').default(true),
    parseLimit: Schema.number().min(1).max(10).step(1).label('每条消息解析上限').default(3)
  }).description('解析范围'),
  Schema.object({
    formatNumbers: Schema.boolean().label('统计数字使用万 / 亿').default(true),
    forward: Schema.boolean().label('合并转发').description('仅 OneBot 生效，其他平台按顺序发送').default(false),
    showError: Schema.boolean().label('发送失败提示').description('卡片生成或视频流获取失败时发送说明').default(false),
    showLink: Schema.boolean().label('附带视频网页链接').description('附在图片卡片后，可能触发其他机器人的解析').default(false)
  }).description('消息与卡片'),
  Schema.union([
    Schema.object({
      showLink: Schema.const(true).required(),
      idPreference: Schema.union([Schema.const('bv').description('BV 号'), Schema.const('av').description('AV 号')])
        .role('radio').label('网页链接编号').default('bv')
    }),
    Schema.object({})
  ]),
  Schema.object({
    downloadVideo: Schema.boolean().label('下载后发送').description('关闭时发送远程 MP4 地址，协议端可能因防盗链而发送失败').default(true),
    maxFileSize: Schema.number().min(1).max(200).label('视频大小上限（MiB）')
      .description('下载时同时检查响应头和实际字节数；远程发送时由协议端限制').default(50),
    minDuration: Schema.number().min(0).label('最小时长（分钟）').default(0),
    maxDuration: Schema.number().min(0).label('最大时长（分钟）').description('0 表示不限制').default(25),
    filterAction: Schema.union([
      Schema.const('card').description('发送已选图片卡片及提示'),
      Schema.const('notice').description('仅发送提示'),
      Schema.const('silent').description('不发送任何内容')
    ]).role('radio').label('时长或大小受限时').default('card')
  }).description('视频发送'),
  Schema.object({
    shortTip: Schema.string().label('时长不足').default('视频时长低于解析下限'),
    longTip: Schema.string().label('时长超限').default('视频时长超过解析上限'),
    sizeTip: Schema.string().label('大小超限').default('视频大小超过发送上限')
  }).description('受限提示文案').collapse(),
  Schema.object({
    cooldown: Schema.number().min(0).max(86400).label('重复视频间隔（秒）')
      .description('按机器人、频道、视频及分 P 去重，0 表示不限制').default(180),
    bufferDelay: Schema.number().min(0).max(30).label('消息缓冲（秒）')
      .description('从第一条消息开始计时，结束后串行处理').default(5),
    queueLimit: Schema.number().min(1).max(256).step(1).label('待处理消息上限').default(64)
  }).description('队列与去重'),
  Schema.object({
    requestTimeout: Schema.number().min(1).max(120).label('API 请求超时（秒）').default(15),
    downloadTimeout: Schema.number().min(1).max(300).label('视频下载超时（秒）').default(120),
    userAgent: Schema.string().label('User-Agent').default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'),
    debug: Schema.boolean().label('调试日志').description('记录任务状态，不记录媒体正文或签名视频地址').default(false)
  }).description('网络与调试').collapse()
])
