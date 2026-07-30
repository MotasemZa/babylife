# Baby Life — babylife.jo

The Baby Life website (Jordan's #1 diaper brand, made in Amman by Khattab Group) as a static
webapp. Migrated from WordPress: same content, same bilingual EN/Arabic structure, no database,
no plugins — every piece of content is a plain file in this repo.

## Stack

- [Astro](https://astro.build) static build — outputs plain HTML/CSS to `dist/`
- No frontend framework, ~2 small inline scripts (mobile nav, product gallery)
- One dependency besides Astro: `@astrojs/sitemap`
- Bilingual: English at `/`, Arabic (RTL) at `/ar/` — 69 pages total

## Editing content

| What | Where |
| --- | --- |
| Products (19) | `src/data/products.json` — names, EN/AR copy, sizes, pack formats, size charts, gallery |
| Product ranges (4) | `src/data/ranges.json` |
| Blog posts (5) | `src/data/posts.json` — EN + AR bodies as HTML |
| About / Careers pages | `src/data/pages.json` |
| Phone, email, address, socials, hero copy, stats | `src/data/site.json` |
| Every UI label (buttons, headings, nav) | `src/lib/i18n.ts` |
| Design (colours, fonts, spacing) | `src/styles/global.css` |
| Images | `public/images/` |

## Develop & build

```sh
npm install
npm run dev       # local dev server
npm run build     # static site → dist/
```

## Deploy (Hostinger)

The build output in `dist/` is plain static files + `contact-form.php` (the contact form
endpoint, which uses PHP `mail()`). Upload the contents of `dist/` to
`domains/babylife.jo/public_html/` and the site is live. Example:

```sh
npm run build
rsync -avz --delete -e "ssh -p 65002" dist/ u535022945@92.113.18.86:domains/babylife.jo/public_html/
```

(Keep a backup of the WordPress site before the first deploy.)
