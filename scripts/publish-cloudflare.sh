#!/usr/bin/env bash
set -euo pipefail

# Run on the computer where you use Cloudflare. Wrangler reuses its local login
# and opens an OAuth login in your browser if authentication is needed.
case "${1:-}" in
  '') dry_run=false ;;
  --dry-run) dry_run=true ;;
  *) printf 'Usage: bash scripts/publish-cloudflare.sh [--dry-run]\n' >&2; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then
  printf 'Usage: bash scripts/publish-cloudflare.sh [--dry-run]\n' >&2
  exit 2
fi

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
command -v node >/dev/null || { printf 'Install Node.js 22.12 or newer first.\n' >&2; exit 1; }
command -v npx >/dev/null || { printf 'Install npm (which includes npx) first.\n' >&2; exit 1; }
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) { console.error("Install Node.js 22.12 or newer first."); process.exit(1); }'
node scripts/build-static.mjs

if [ "$dry_run" = true ]; then
  npx --yes wrangler@4.162.0 deploy --config wrangler.jsonc --dry-run
  exit 0
fi

printf '\nPublishing the website to Worker artbenchmark on artbenchmark.org and www.artbenchmark.org.\n'
printf 'Use the Cloudflare account that owns artbenchmark.org if prompted.\n\n'
npx --yes wrangler@4.162.0 deploy --config wrangler.jsonc
node scripts/verify-live.mjs
