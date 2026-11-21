# Agent Note: 卡片渲染改用 takumi 服务

Status: implemented

## Problem

本插件、impart、mc-toolbox、meme-generator 各自内置 Takumi Renderer 并读入同一批 Noto Sans SC / KR、DejaVu 字体。同时启用时字体与原生 Renderer 常驻多份，渲染互相争抢 CPU，Takumi 和字体版本也各自漂移。

## Decision

- 渲染交给 `chatluna-plugin-takumi` 提供的必需服务 `takumi`：`inject` 与 `cordis.service.required` 声明 `takumi`，`package.json` 以 peerDependency 声明该插件，移除 `@takumi-rs/*` 与字体包依赖。
- `CardRenderer`（`src/card.ts`）只组装 `cardHtml` 并调用 `ctx.takumi.render`，以 `fetch` 传入 `BilibiliClient.image`。受信 CDN 白名单和大小限额仍在本插件，服务不发网络请求。
- 实体解码 `decodeCardNode` 移入服务（`decodeNode`），相应测试一起迁移。
- 资源失败的占位改为透明，封面与头像由各自容器底色兜底。

## Alternatives considered

- 抽共享 npm 库：能去掉重复代码，但每个插件仍各有一份 Renderer 与字体，内存不变。
- 服务暴露 `Renderer` 实例：调用方会与服务的 Takumi 版本强耦合，拒绝。
- 由服务统一下载远程图片：通用服务无法知道每个插件的可信域名与限额，拒绝。

## Consequences

- 使用者需同时安装并启用 `chatluna-plugin-takumi`，否则本插件保持 pending。
- 其他使用 Takumi 的插件迁移后，字体只加载一份；渲染并发由服务配置统一限制。
