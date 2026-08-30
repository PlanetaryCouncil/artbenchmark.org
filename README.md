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

Every new work is broadcast automatically. On push to `main` (when `index.html` or
`works/` changes), `.github/workflows/syndicate.yml` runs `syndicate.mjs`, which reads
the `WORKS` array (through the `WORKS:BEGIN`/`WORKS:END` markers — keep them intact),
checks `syndicated.json` for what has already gone out, and announces each new work on
four rails:

| rail             | needs (repo secrets)                        | what happens                                   |
| ---------------- | ------------------------------------------- | ---------------------------------------------- |
| Internet Archive | nothing                                     | Wayback snapshot of the page and the image     |
| Nostr            | `NOSTR_NSEC`                                | kind-1 note signed with your key, 4 relays     |
| Farcaster        | `NEYNAR_API_KEY`, `NEYNAR_SIGNER_UUID`      | cast with image + site embeds, via Neynar      |
| Telegram         | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`    | photo + placard caption to the channel         |

Rails without secrets are skipped, not failed — the Archive rail works from day one.
`syndicated.json` records which rails carried which work, so adding a key later
back-fills only what that rail missed. A failed rail stays unrecorded and retries on
the next run. Run locally with `npm run dry-run` to see what would fire, or
`npm run syndicate` to fire it (same env vars).

Add secrets at Settings → Secrets and variables → Actions. The nsec never appears in
the repo — only the signed events leave.
