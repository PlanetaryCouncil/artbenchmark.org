# Art Benchmark

A bright, mobile-friendly placeholder for [artbenchmark.org](https://artbenchmark.org/).

“Who decides what is art?” introduces the provisional art benchmark from Marsita the
Ultra and Planetary Council. The page includes the poster, an expandable text
transcript, and links to Planetary Council, Telegram, Twitter / X and Instagram.

## Website

Static HTML and CSS, with no build step or runtime dependencies. GitHub Pages serves
`index.html` from this repository; `CNAME` retains the existing custom domain.

- `index.html` — page copy, links, accessible poster transcript, and social metadata.
- `styles.css` — responsive cream, yellow and violet layout.
- `assets/art-benchmark.jpg` — full-size provisional poster, based on the supplied image.
- `assets/art-benchmark*.webp` — smaller, responsive versions for the page.
- `assets/share-preview.svg` / `.png` — editable source and 1200 × 630 social preview.
- `assets/favicon.svg`, `favicon.ico`, and `assets/apple-touch-icon.png` — site icons.
- `robots.txt` / `sitemap.xml` — crawler discovery.

Open `index.html` through a local static server to preview root-relative asset links.
When changing the public domain, update `CNAME`, the canonical URL, social image URLs,
`robots.txt` and `sitemap.xml` together. To update the share card, edit the SVG and
export it as a 1200 × 630 PNG. Social platforms may cache old previews.

## Future collection and existing syndication

The page keeps an empty `WORKS` array between the `WORKS:BEGIN` / `WORKS:END` markers
for compatibility with the existing syndicator. The placeholder poster is a page
asset, not a collection entry, so it will not be broadcast by that workflow.

The existing distribution tooling is retained for future use. Adding entries to the
array makes them available to the syndicator; displaying a future collection would
also require a new page layout.

## Distribution rails — we preserve consciousness

Every new work is broadcast automatically by `.github/workflows/syndicate.yml`, which
runs `syndicate.mjs`. It reads the `WORKS` array (through the `WORKS:BEGIN`/`WORKS:END`
markers; keep them intact), checks `syndicated.json` for what has already gone out, and
announces works on six rails:

| rail             | needs (repo secrets)                            | what happens                                |
| ---------------- | ----------------------------------------------- | ------------------------------------------- |
| Internet Archive | nothing                                         | Wayback snapshot of the page and the image  |
| Nostr            | `NOSTR_NSEC`                                    | kind-1 note signed with your key, 4 relays  |
| Farcaster        | `NEYNAR_API_KEY`, `NEYNAR_SIGNER_UUID`          | cast with image + site embeds, via Neynar   |
| Telegram         | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`        | photo + placard caption to the channel      |
| Facebook         | `META_PAGE_ID`, `META_PAGE_TOKEN`               | photo post on your Page                     |
| Instagram        | `META_IG_USER_ID`, `META_PAGE_TOKEN`            | feed post with placard caption + hashtags   |

### The drip

Distribution is a discipline, not a dump. The workflow runs on every push to `main` and
three times a day (08:17, 14:17, 20:17 UTC). Each run broadcasts at most `MAX_PER_RUN`
works (default **1**; set it under Settings → Secrets and variables → Actions →
Variables), newest first. New arrivals go out promptly and the back catalogue follows
at a steady pace. At 1 per run, 10,000 works is a nine-year broadcast. That is the point:
a feed people can live alongside, not one they mute.

### What happens when things go wrong

- **Rails without secrets** are skipped, not failed. The Archive rail works from day one.
  `syndicated.json` records which rails carried which work, so adding a key later
  back-fills only what that rail missed (still through the drip).
- **A failed rail** (network, rate limit, expired token) stays unrecorded and retries
  next run. Rails that succeeded in the same run are still recorded and never post twice.
- **A refused rail** is one where retrying can't help. Instagram accepts only JPEGs under
  8 MB with an aspect ratio between 4:5 and 1.91:1, so a panorama, a tall scroll or a PNG
  is refused with the reason written to the ledger. Give that work an `img_social`
  field (a cropped or padded JPEG) and the rail reopens on the next run.

`npm run dry-run` shows what the next run would fire; `npm run syndicate` fires it
(same env vars).

### Setting up Meta (Facebook + Instagram)

This is the fiddliest rail; it takes about 20 minutes, once.

1. Switch the Instagram account to **Professional** (Business or Creator) and link it to
   your Facebook Page (Instagram → Settings → Account type / Linked accounts).
2. At developers.facebook.com, create an app of type **Business**. Leave it in development
   mode: posting to Pages you admin doesn't need app review.
3. In the **Graph API Explorer**, select the app and generate a User token with
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`,
   `instagram_basic` and `instagram_content_publish`.
4. Run, locally:
   ```
   npm install
   META_APP_ID=… META_APP_SECRET=… node meta-token.mjs <the Explorer token>
   ```
   It exchanges the token for a non-expiring Page token and prints `META_PAGE_ID`,
   `META_PAGE_TOKEN` and `META_IG_USER_ID`.
5. Paste those three into the repo's Actions secrets, then clear your terminal.

The Page token stops working if you change your Facebook password or remove the app.
If that happens, repeat steps 3–5. Failed runs will tell you, and nothing is lost: the
ledger retries.

Add all secrets at Settings → Secrets and variables → Actions. No credential ever
appears in the repo; only signed posts leave.
