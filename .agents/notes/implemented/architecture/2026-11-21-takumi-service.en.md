# Agent Note: Render cards through the takumi service

Status: implemented

## Problem

This plugin, impart, mc-toolbox and meme-generator each embedded a Takumi Renderer and loaded the same Noto Sans SC / KR and DejaVu fonts. With all of them enabled, fonts and native renderers stayed resident several times, renders competed for CPU, and Takumi and font versions drifted apart.

## Decision

- Rendering goes through the required `takumi` service from `chatluna-plugin-takumi`: `inject` and `cordis.service.required` list `takumi`, `package.json` declares the plugin as a peer dependency, and the `@takumi-rs/*` and font packages are gone.
- `CardRenderer` (`src/card.ts`) only builds `cardHtml` and calls `ctx.takumi.render`, passing `BilibiliClient.image` as `fetch`. The trusted CDN list and size limits stay here; the service makes no network requests.
- Entity decoding (`decodeCardNode`) moved into the service as `decodeNode`, together with its test.
- Failed resources now use a transparent placeholder; cover and avatar containers supply the background.

## Alternatives considered

- A shared npm library: removes duplicated code, but every plugin still holds its own renderer and fonts, so memory does not change.
- Exposing the `Renderer` instance: couples callers to the service's Takumi version; rejected.
- Letting the service download remote images: a generic service cannot know each plugin's trusted hosts and limits; rejected.

## Consequences

- Users must install and enable `chatluna-plugin-takumi`; otherwise this plugin stays pending.
- Once the other Takumi plugins migrate, fonts load once and render concurrency is limited in one place.
