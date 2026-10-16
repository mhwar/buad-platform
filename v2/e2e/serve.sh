#!/usr/bin/env bash
# The whole platform on a fresh, migrated local D1, as the end-to-end tests see it.
# Expects the web app already built (`pnpm build`): the Worker serves it as static assets.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
state="$here/.state"
port="${E2E_PORT:-8788}"
rm -rf "$state"
cd "$here/../apps/api"
pnpm exec wrangler d1 migrations apply buad-v2 --local --persist-to "$state" >/dev/null
# Test-only secrets, passed as vars so a developer's own .dev.vars is left alone.
exec pnpm exec wrangler dev --local --port "$port" --persist-to "$state" \
  --var "OWNER_SETUP_TOKEN:${E2E_SETUP_TOKEN:-e2e-setup-token-0123456789abcdef}" \
  --var "JWT_SECRET:e2e-only-jwt-secret-0123456789abcdef0123456789"
