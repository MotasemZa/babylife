# Baby Life webapp — agent guide

Bilingual (EN/AR) static brand site for babylife.jo, built with Astro. It replaced a WordPress
site; all content now lives in flat files. **When asked to change content, edit the data files —
almost never the page templates.**

## Where things live

- `src/data/products.json` — the 19 products. Each has `title.{en,ar}`, `body.{en,ar}` (HTML),
  `count`, `sizes`, `formats` (array of [en, ar] pairs), `chart` (size table rows),
  `gallery` (image + EN/AR captions), `ranges` (slugs), `seo`.
- `src/data/ranges.json` — the 4 product ranges (babylife, ladylife, life, adult-care).
- `src/data/posts.json` — blog posts, newest first. `body.{en,ar}` are HTML strings.
- `src/data/pages.json` — About and Careers page bodies (HTML, EN + AR).
- `src/data/site.json` — contact info, social URLs, hero copy, the 3 stats.
- `src/lib/i18n.ts` — every UI string as `{ en, ar }`. Add new strings here, use `t(lang, key)`.
  Also exports `benefits` (company claims) and `layers` (the four construction facts labelled
  in the home page cutaway). Keep `layers` in step with `DiaperCutaway.astro`: the list index
  is what the numbered pins in the drawing refer to.
- `src/components/DiaperCutaway.astro` — the diaper cross-section on the home page, drawn in
  SVG because the brand has pack shots but no photography of the product itself. Geometry is
  documented in the file; pins must sit inside both their own layer wedge and the silhouette.
- `src/components/SizeFinder.astro` — the weight→size widget on the home page. Its bands are
  parsed at build time from the baby-life-diapers `chart` in products.json, so it can never
  disagree with the printed size table; edit the chart, not the widget.
- `src/styles/global.css` — the whole design system. CSS logical properties only
  (margin-inline-start, not margin-left) so RTL works automatically.
- `src/views/*.astro` — one view per page type, shared by both languages via a `lang` prop.
- `src/pages/` — thin route files; the `ar/` subtree mirrors the root and passes `lang="ar"`.

## Behaviour to know about

- A head script in `Base.astro` routes the home page by language: a stored explicit choice
  (set when the header switcher is clicked, key `bl-lang`) always wins; otherwise an
  Arabic-preferring browser landing on `/` is sent to `/ar/`. Deep links are never redirected.
- `Base.astro` also runs the scroll machinery: `.site-header.is-compact` past 40px, a `--p`
  viewport-progress variable on any `[data-fx]` element (the hero pack fan reads it), count-up
  hero stats and pointer tilt on cards. Everything checks `prefers-reduced-motion`.
- The home-page cutaway section is a sticky scroll story (`.cut-track`/`.cut-sticky`): the
  section is ~210vh tall and the layer list lights up in construction order as you scroll.
  Disabled under 900px and under reduced motion. Tall-viewport screenshots make this section
  look like a huge blank gap — that is the track, not a bug.

## Rules

- Every user-visible string must exist in both `en` and `ar`. Never hardcode English in a view.
- URLs: prefix internal links with `base(lang)` (`''` or `'/ar'`), always trailing slash.
- Images go in `public/images/`; reference as `/images/...`.
- After content changes run `npm run build` — it must produce 69+ pages with no errors.
- Deploy = upload `dist/` contents to Hostinger `domains/babylife.jo/public_html/` (see README).
