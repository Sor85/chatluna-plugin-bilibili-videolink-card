import type { Context } from 'cordis'
import { registerReactFormExtension } from '@chatluna/ui-schema-form/client'
import { OutputsField } from './outputs-field'
import zh from './locales/zh.yml'
import en from './locales/en.yml'

export default function apply(ctx: Context) {
  ctx.locale.register('bilibili-videolink-card', { zh, en })
  ctx.effect(() => registerReactFormExtension({
    type: 'array', role: 'bilibili-videolink-card:outputs', component: OutputsField, priority: 30
  }))
}
