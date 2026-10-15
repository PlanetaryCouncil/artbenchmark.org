#!/usr/bin/env node
// Syndication rails for artbenchmark.org — we preserve consciousness.
//
// Reads the WORKS array out of index.html (between the WORKS:BEGIN/END markers),
// compares it against syndicated.json, and broadcasts not-yet-announced works to
// whichever rails have credentials:
//
//   archive   (no credentials)                        Wayback Machine snapshot
//   nostr     NOSTR_NSEC                              kind-1 note to public relays
//   farcaster NEYNAR_API_KEY + NEYNAR_SIGNER_UUID     cast via Neynar
//   telegram  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   sendPhoto to the channel
//   facebook  META_PAGE_ID + META_PAGE_TOKEN          photo post on the Page
//   instagram META_IG_USER_ID + META_PAGE_TOKEN       feed post on the linked IG account
//
// Distribution is a drip, not a dump: each run broadcasts at most MAX_PER_RUN
// works (default 1), newest first, so new arrivals go out promptly and the back
// catalogue follows behind at a fixed cadence.
//
// Rails without credentials are skipped and reported, never fatal. A rail that
// rejects a work for a reason retrying cannot fix (e.g. an Instagram aspect
// ratio) is recorded as refused and not retried until the work's image changes.
// Usage: node syndicate.mjs [--dry-run]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE_URL || "https://artbenchmark.org";
const LEDGER = join(ROOT, "syndicated.json");
const DRY = process.argv.includes("--dry-run");
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 1);
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.primal.net"
];

// A rejection retrying won't fix. Recorded in the ledger against the image it
// was raised for, so swapping the image (or adding img_social) re-opens the rail.
class Refusal extends Error {}

// ---------- read the wall ----------

function loadWorks() {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const m = html.match(/\/\/ WORKS:BEGIN\s*const WORKS = (\[[\s\S]*?\]);\s*\/\/ WORKS:END/);
  if (!m) throw new Error("WORKS:BEGIN/END markers not found in index.html");
  return new Function(`return ${m[1]}`)();
}

function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER, "utf8")); }
  catch { return {}; }
}

const imageUrl = w => `${SITE}/${w.img}`;
// Optional per-work override for feeds with format rules (Instagram's aspect
// ratios, JPEG only). Falls back to the wall image.
const socialUrl = w => `${SITE}/${w.img_social || w.img}`;

const fmtScores = w =>
  ["form", "signal", "spread"]
    .map(k => `${k} ${k in w ? w[k] + "/10" : "—"}`)
    .join(" · ");

const announcement = w =>
  `№ ${w.id} — ${w.title}\n` +
  `${w.desc}\n` +
  `${fmtScores(w)} (AI-assigned, single pass)\n` +
  `${SITE}/`;

const hashtags = w =>
  ["artbenchmark", "art", ...(w.tags || [])]
    .map(t => "#" + String(t).replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter(t => t.length > 1)
    .slice(0, 30) // Instagram's limit
    .join(" ");

// ---------- rails ----------

async function railArchive(w) {
  const saved = [];
  for (const url of [`${SITE}/`, imageUrl(w)]) {
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      redirect: "follow",
      headers: { "user-agent": "artbenchmark-syndicator/1.0" }
    });
    // SPN answers 200 on capture, 429 when rate-limited; both leave the URL
    // requestable again on the next run, so record only real captures.
    if (res.ok) saved.push(url);
  }
  if (!saved.length) throw new Error("Wayback declined both captures (rate limit?)");
  return `archived ${saved.length}/2 urls`;
}

async function railNostr(w, text) {
  if (!process.env.NOSTR_NSEC) return "skipped (no NOSTR_NSEC)";
  const { finalizeEvent } = await import("nostr-tools/pure");
  const nip19 = await import("nostr-tools/nip19");
  const { SimplePool } = await import("nostr-tools/pool");
  const { useWebSocketImplementation } = await import("nostr-tools/relay");
  if (typeof WebSocket === "undefined") {
    const ws = await import("ws");
    useWebSocketImplementation(ws.default);
  }
  const decoded = nip19.decode(process.env.NOSTR_NSEC.trim());
  if (decoded.type !== "nsec") throw new Error("NOSTR_NSEC is not an nsec key");
  const event = finalizeEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["r", imageUrl(w)],
      ["r", `${SITE}/`],
      ["t", "artbenchmark"],
      ["t", "art"]
    ],
    content: `${text}\n${imageUrl(w)}`
  }, decoded.data);
  const pool = new SimplePool();
  const results = await Promise.allSettled(pool.publish(RELAYS, event));
  pool.close(RELAYS);
  const ok = results.filter(r => r.status === "fulfilled").length;
  if (!ok) throw new Error("no relay accepted the event");
  return `published to ${ok}/${RELAYS.length} relays (${event.id})`;
}

async function railFarcaster(w, text) {
  const key = process.env.NEYNAR_API_KEY, signer = process.env.NEYNAR_SIGNER_UUID;
  if (!key || !signer) return "skipped (no NEYNAR_API_KEY / NEYNAR_SIGNER_UUID)";
  const res = await fetch("https://api.neynar.com/v2/farcaster/cast", {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      signer_uuid: signer,
      text,
      embeds: [{ url: imageUrl(w) }, { url: `${SITE}/` }]
    })
  });
  if (!res.ok) throw new Error(`Neynar ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return `cast ${j.cast?.hash || "ok"}`;
}

async function railTelegram(w, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return "skipped (no TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)";
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, photo: imageUrl(w), caption: text })
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
  return "sent";
}

// ---------- Meta ----------

async function graph(method, path, params) {
  const qs = new URLSearchParams({ ...params, access_token: process.env.META_PAGE_TOKEN });
  const res = method === "GET"
    ? await fetch(`${GRAPH}/${path}?${qs}`)
    : await fetch(`${GRAPH}/${path}`, { method, body: qs });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Meta ${res.status}: ${j.error?.message || JSON.stringify(j)}`);
  return j;
}

async function railFacebook(w, text) {
  const page = process.env.META_PAGE_ID;
  if (!page || !process.env.META_PAGE_TOKEN) return "skipped (no META_PAGE_ID / META_PAGE_TOKEN)";
  const j = await graph("POST", `${page}/photos`, { url: imageUrl(w), caption: text });
  return `post ${j.post_id || j.id}`;
}

// Instagram fetches the image itself and rejects anything that isn't a JPEG
// under 8 MB with an aspect ratio between 4:5 and 1.91:1. Check first, so a
// panorama or a tall piece is refused with a reason instead of a Graph error.
async function assertInstagramReady(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image not reachable (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let dims;
  try { dims = imageSize(buf); }
  catch (err) { throw new Refusal(`image unreadable (${err.message}); fix the file or add img_social`); }
  const { width, height, type } = dims;
  if (type !== "jpg") throw new Refusal(`Instagram takes JPEG only, image is ${type}; add img_social`);
  if (buf.length > 8 * 1024 * 1024) throw new Refusal(`image is ${(buf.length / 1048576).toFixed(1)} MB, Instagram max is 8 MB; add img_social`);
  const ratio = width / height;
  if (ratio < 0.8 || ratio > 1.91)
    throw new Refusal(`aspect ratio ${width}×${height} is outside Instagram's 4:5–1.91:1; add img_social`);
}

async function railInstagram(w, text) {
  const ig = process.env.META_IG_USER_ID;
  if (!ig || !process.env.META_PAGE_TOKEN) return "skipped (no META_IG_USER_ID / META_PAGE_TOKEN)";
  const url = socialUrl(w);
  await assertInstagramReady(url);
  const caption = `${text}\n\n${hashtags(w)}`;
  const { id: container } = await graph("POST", `${ig}/media`, { image_url: url, caption });
  // Containers are processed asynchronously; publishing before FINISHED fails.
  for (let i = 0; i < 20; i++) {
    const { status_code } = await graph("GET", container, { fields: "status_code" });
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`IG container ${status_code}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  const { id } = await graph("POST", `${ig}/media_publish`, { creation_id: container });
  return `media ${id}`;
}

const RAILS = {
  archive: railArchive,
  nostr: railNostr,
  farcaster: railFarcaster,
  telegram: railTelegram,
  facebook: railFacebook,
  instagram: railInstagram
};

// A rail is settled for a work once it carried it, or refused the exact image
// the work still points at.
const settled = (record, rail, w) => {
  const r = record.rails[rail];
  return !!r && (!r.refused || r.img === socialUrl(w));
};

// ---------- main ----------

const works = loadWorks();
const ledger = loadLedger();

if (!works.length) {
  console.log("The wall is bare — nothing to syndicate yet.");
  process.exit(0);
}

const queue = [...works]
  .sort((a, b) => b.date.localeCompare(a.date))
  .filter(w => {
    const record = ledger[w.id] || { rails: {} };
    return Object.keys(RAILS).some(r => !settled(record, r, w));
  });

const batch = queue.slice(0, MAX_PER_RUN);
let ledgerDirty = false;

for (const w of batch) {
  const record = ledger[w.id] || (ledger[w.id] = { rails: {} });
  const pending = Object.keys(RAILS).filter(r => !settled(record, r, w));
  const text = announcement(w);
  console.log(`\n№ ${w.id} — ${w.title}`);

  for (const rail of pending) {
    if (DRY) { console.log(`  ${rail}: would fire`); continue; }
    try {
      const outcome = await RAILS[rail](w, text);
      console.log(`  ${rail}: ${outcome}`);
      if (!outcome.startsWith("skipped")) {
        record.rails[rail] = { at: new Date().toISOString(), outcome };
        ledgerDirty = true;
      }
    } catch (err) {
      if (err instanceof Refusal) {
        console.log(`  ${rail}: REFUSED — ${err.message}`);
        record.rails[rail] = { at: new Date().toISOString(), refused: err.message, img: socialUrl(w) };
        ledgerDirty = true;
      } else {
        console.error(`  ${rail}: FAILED — ${err.message}`);
        process.exitCode = 1; // retried next run; ledger stays unmarked
      }
    }
  }
}

const waiting = queue.length - batch.length;
if (waiting > 0) console.log(`\n${waiting} more work${waiting === 1 ? "" : "s"} in the queue for later runs.`);

if (ledgerDirty) {
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log("Ledger updated: syndicated.json");
} else if (!DRY && !batch.length) {
  console.log("Nothing new left to broadcast.");
}
