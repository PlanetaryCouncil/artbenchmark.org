# Art Benchmark

The Marsita the Ultra & Planetary Council collection of visual works, each scored on three
axes. Single self-contained page: `index.html` (data lives in the `WORKS` array in the
inline script). Images live in `works/`.

Live at https://artbenchmark.org (GitHub Pages, `CNAME` in this repo).

Sibling projects: the music is at
[marsita-the-ultra](https://github.com/PlanetaryCouncil/marsita-the-ultra);
this benchmark is for visual images.

Discussion and re-scoring: https://t.me/planetarycouncil

## Adding a work

1. Drop the image into `works/` — e.g. `works/001.jpg`. Web-sized (≤ ~2000 px on the
   long edge, ≤ ~1 MB) keeps the wall fast.
2. Add an entry to the `WORKS` array in `index.html`:

```js
{
  id: "001",                    // catalogue number, zero-padded
  date: "2026-08-30",           // ISO; drives the "Newest" sort
  title: "…",
  medium: "digital",            // free text: digital, oil, photograph, collage…
  img: "works/001.jpg",
  desc: "…",                    // what it is, 1–2 sentences
  note: "…",                    // the mono footnote: provenance, the catch, the story
  form: 0, signal: 0, spread: 0 // 0–10 each, AI-assigned, single pass
}
```

## The three axes

| axis   | 0 means            | 10 means                                    |
| ------ | ------------------ | ------------------------------------------- |
| form   | an accident        | nothing you could move without breaking it  |
| signal | decoration         | you cannot unsee it once it's named         |
| spread | stays on the wall  | distributes itself                          |

Omit an axis entirely (rather than scoring it 0) when it has nothing to measure — it
renders as a dashed "—" meter and sorts to the bottom of that axis. A zero is a
judgement, a dash is an admission.

The scores are AI-assigned, single-pass, and the page says so. Re-scoring happens in
the Telegram channel: https://t.me/planetarycouncil

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
