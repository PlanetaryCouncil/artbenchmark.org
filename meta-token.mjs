#!/usr/bin/env node
// One-time helper: turns a short-lived Graph API Explorer user token into the
// three Meta secrets the syndicator needs. A Page token derived from a
// long-lived user token does not expire (until you change your password or
// revoke the app), so this runs once, locally — never in CI.
//
//   META_APP_ID=… META_APP_SECRET=… node meta-token.mjs <short-lived-user-token>
//
// Prints META_PAGE_ID, META_PAGE_TOKEN and META_IG_USER_ID for every Page you
// manage. Paste the right ones into the repo's Actions secrets, then clear your
// terminal: the token is a credential.

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
const { META_APP_ID: appId, META_APP_SECRET: appSecret } = process.env;
const shortToken = process.argv[2];

if (!appId || !appSecret || !shortToken) {
  console.error("usage: META_APP_ID=… META_APP_SECRET=… node meta-token.mjs <short-lived-user-token>");
  process.exit(2);
}

async function get(path, params) {
  const res = await fetch(`${GRAPH}/${path}?${new URLSearchParams(params)}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error?.message || `HTTP ${res.status}`);
  return j;
}

const { access_token: longUserToken } = await get("oauth/access_token", {
  grant_type: "fb_exchange_token",
  client_id: appId,
  client_secret: appSecret,
  fb_exchange_token: shortToken
});

const { data: pages } = await get("me/accounts", {
  fields: "id,name,access_token,instagram_business_account",
  access_token: longUserToken
});

if (!pages.length) {
  console.error("No Pages found. Did the Explorer token include pages_show_list and pages_manage_posts?");
  process.exit(1);
}

for (const p of pages) {
  console.log(`\n# ${p.name}`);
  console.log(`META_PAGE_ID=${p.id}`);
  console.log(`META_PAGE_TOKEN=${p.access_token}`);
  console.log(p.instagram_business_account
    ? `META_IG_USER_ID=${p.instagram_business_account.id}`
    : "# no Instagram professional account linked to this Page");
}
