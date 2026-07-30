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
- `src/styles/global.css` — the whole design system. CSS logical properties only
  (margin-inline-start, not margin-left) so RTL works automatically.
- `src/views/*.astro` — one view per page type, shared by both languages via a `lang` prop.
- `src/pages/` — thin route files; the `ar/` subtree mirrors the root and passes `lang="ar"`.

## Rules

- Every user-visible string must exist in both `en` and `ar`. Never hardcode English in a view.
- URLs: prefix internal links with `base(lang)` (`''` or `'/ar'`), always trailing slash.
- Images go in `public/images/`; reference as `/images/...`.
- After content changes run `npm run build` — it must produce 69+ pages with no errors.
- Deploy = upload `dist/` contents to Hostinger `domains/babylife.jo/public_html/` (see README).
