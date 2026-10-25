# Fixture: Next.js application

The two-workflows fixture converted by hand (test/e2e/two-workflows.test.mjs): what a conversion a developer can maintain
looks like, on a small site.

## Run

`npm install`, then `npm run dev` (development) or `npm run build && npm start` (production). `npm run lint` and
`npm run typecheck` check the source.

## Routes

- `/`: `app/page.tsx` (hero, feature cards, the embedded preview)
- `/about`: `app/about/page.tsx`

Both share `app/layout.tsx`: the header (`components/SiteHeader.tsx`) and the footer (`components/SiteFooter.tsx`).
A new page is a folder under `app/` with a `page.tsx`; add its link to `site.nav` in `content/site.ts` with `route: true`.

## Where to change content

`content/site.ts`: the navigation, the footer, the home page's title, lead, features and embed, the about page's copy.

## Styling

Tailwind utilities on each element (the site's exact sizes and colours as arbitrary values); `app/globals.css` imports
Tailwind and sets the theme's sans font to the site's own font stack. A hover is a `hover:` utility on the element that
has it.

## Behaviour and animation

None: the site is static. The embedded preview (`components/EmbeddedPreview.tsx`) is the first-party document the site
itself embeds, kept as an embed.

## Assets

None: images and fonts would go in `public/`.
