# design-sync notes — Oraya Welcome Book seed

- **Shape is `brand-seed`, not `package` or `storybook`.** This repo has no component
  library, no Storybook, and no `dist/` to bundle. The seed is deliberately brand +
  content only (see `../README.md`), so the standard converter (`package-build.mjs`)
  has nothing to operate on and is not used. The project is produced by hand into
  `ds-bundle/` and uploaded directly.
- **Zero components is intentional.** The seed's own rules say the site's React
  components (`OrayaEmblem`, `OrayaLogoFull`) are excluded so nothing anchors the
  exploration to existing code. Do not add a component bundle without changing the brief.
- **No `_ds_sync.json` anchor.** The anchor's key recipe assumes components/stories to
  hash and skip. With no components there is nothing to skip and a re-sync is cheap, so
  the sidecar is omitted rather than faked. A re-sync simply rebuilds and re-uploads.
- **Fonts load from Google Fonts** (`tokens/type.css` `@import`). There are no local
  `.woff2` files anywhere in the repo, so there is nothing to vendor into `fonts/`.
  Verified: `document.fonts.check()` reports both Playfair Display and Lato loaded in a
  headless render.
- **`.design-sync/` lives in the seed directory**, not the repo root — it is scoped to
  this seed, which is the only thing being synced.
- **Verification** was done with the puppeteer already installed in the main checkout
  (`../../../../../node_modules/puppeteer`); the worktree has no `node_modules`. A proof
  page exercising every primitive was rendered and checked (A4 = 793.69×1122.52px, both
  fonts loaded, tokens resolving), then deleted — it is not part of the upload.
- **Photo slots must never render as an empty "PHOTO" box.** `.oraya-photo-slot` degrades
  to a gold-washed field with a gem ornament; on `--midnight` grounds the wash is carried
  harder (a faint gold-10 wash disappears against `#1F2B38`).
