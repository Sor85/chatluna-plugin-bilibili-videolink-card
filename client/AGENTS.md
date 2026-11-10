# client 说明

适用范围：`client/`。同时遵守根 `AGENTS.md`；配置及服务端见 `src/AGENTS.md`。

- 仅为 `bilibili-videolink-card:outputs` 注册数组表单扩展，嵌入宿主插件设置页；不添加独立配置接口、路由或通用控件覆盖。
- 控件复用 `@chatluna/ui-kit` 的 Field/Checkbox，值通过 SchemaForm 的 onChange 交还宿主，保留宿主保存、撤销和 JSON 编辑。
- 根容器显式设置字号、行高；不覆盖宿主滚动条、模态层叠或指针样式。
- UI 文案使用 `locales/zh.yml` 和 `locales/en.yml`，通过宿主 locale API 注册。字典必须使用 `card.title` 这样的扁平点分键，值为字符串；宿主 `LocaleService` 按完整键直接索引，不展开嵌套 YAML。陈述式描述，不能隐藏直接链接的有效期和平台限制。
- 客户端扩展通过 ctx.effect 释放，服务端可选注入 chatluna_webui。React 与 ui-kit 使用宿主平台模块，不自行打包一份。
