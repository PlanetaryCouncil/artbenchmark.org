#!/usr/bin/env node
// Syndication rails for artbenchmark.org — we preserve consciousness.
//
// Reads the WORKS array out of index.html (between the WORKS:BEGIN/END markers),
// compares it against syndicated.json, and broadcasts every not-yet-announced
// work to whichever rails have credentials:
//
//   nostr     NOSTR_NSEC                              kind-1 note to public relays
//   farcaster NEYNAR_API_KEY + NEYNAR_SIGNER_UUID     cast via Neynar
//   telegram  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   sendPhoto to the channel
//   archive   (no credentials)                        Wayback Machine snapshot
//
// Rails without credentials are skipped and reported, never fatal — the ledger
// records which rails actually carried each work, so a rail configured later
// picks up only what it missed. Usage: node syndicate.mjs [--dry-run]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE_URL || "https://artbenchmark.org";
const LEDGER = join(ROOT, "syndicated.json");
const DRY = process.argv.includes("--dry-run");

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.primal.net"
];

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

const fmtScores = w =>
  ["form", "signal", "spread"]
    .map(k => `${k} ${k in w ? w[k] + "/10" : "—"}`)
    .join(" · ");

const announcement = w =>
  `№ ${w.id} — ${w.title}\n` +
  `${w.desc}\n` +
  `${fmtScores(w)} (AI-assigned, single pass)\n` +
  `${SITE}/`;

// ---------- rails ----------

async function railNostr(w, text) {
  if (!process.env.NOSTR_NSEC) return "skipped (no NOSTR_NSEC)";
  const { finalizeEvent, nip19 } = await import("nostr-tools/pure").then(async pure => ({
    finalizeEvent: pure.finalizeEvent,
    nip19: await import("nostr-tools/nip19")
  }));
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
      ["r", `${SITE}/${w.img}`],
      ["r", `${SITE}/`],
      ["t", "artbenchmark"],
      ["t", "art"]
    ],
    content: `${text}\n${SITE}/${w.img}`
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
      embeds: [{ url: `${SITE}/${w.img}` }, { url: `${SITE}/` }]
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
    body: JSON.stringify({ chat_id: chat, photo: `${SITE}/${w.img}`, caption: text })
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
  return "sent";
}

async function railArchive(w) {
  const saved = [];
  for (const url of [`${SITE}/`, `${SITE}/${w.img}`]) {
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

const RAILS = {
  nostr: railNostr,
  farcaster: railFarcaster,
  telegram: railTelegram,
  archive: railArchive
};

// ---------- main ----------

const works = loadWorks();
const ledger = loadLedger();

if (!works.length) {
  console.log("The wall is bare — nothing to syndicate yet.");
  process.exit(0);
}

let ledgerDirty = false;

for (const w of works) {
  const record = ledger[w.id] || (ledger[w.id] = { rails: {} });
  const pending = Object.keys(RAILS).filter(r => !record.rails[r]);
  if (!pending.length) continue;

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
      console.error(`  ${rail}: FAILED — ${err.message}`);
      process.exitCode = 1; // retried next run; ledger stays unmarked
    }
  }
}

if (ledgerDirty) {
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log("\nLedger updated: syndicated.json");
} else if (!DRY) {
  console.log("\nNothing new left to broadcast.");
}
