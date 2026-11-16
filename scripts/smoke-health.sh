#!/usr/bin/env bash
# Shared /api/health smoke for both Deploy jobs (#52), with #60's diagnostics:
# the last answer is kept, so a sha that never matches reports what was live.
# Usage: bash scripts/smoke-health.sh <base-url> <stage> <expected-sha> [expected-version]
# The optional 4th argument (#73) is the Worker version id that `wrangler deploy`
# printed; staging passes it, production keeps calling with 3 arguments.
# 12 attempts, 5 s apart, 10 s per request (~60 s). SMOKE_ATTEMPTS and
# SMOKE_SLEEP exist only so tests can run it fast; workflows never set them.
# --fail-with-body (needs 7.76+): a non-2xx is still a miss, but a 503
# {"ok":false} body is kept as last, so the error doesn't claim silence.
set -euo pipefail
url=$1 stage=$2 sha=$3 version=${4:-}
attempts=${SMOKE_ATTEMPTS:-12}
pause=${SMOKE_SLEEP:-5}
body="" last=""
for i in $(seq 1 "$attempts"); do
  body=$(curl --fail-with-body -sS --max-time 10 "$url/api/health" || true)
  [ -n "$body" ] && last=$body
  if [ "$(jq -r .stage <<<"$body" 2>/dev/null)" = "$stage" ] \
    && [ "$(jq -r .sha <<<"$body" 2>/dev/null)" = "$sha" ] \
    && { [ -z "$version" ] || [ "$(jq -r .version <<<"$body" 2>/dev/null)" = "$version" ]; }; then
    break
  fi
  echo "health attempt $i: not ready"
  body=""
  [ "$i" -lt "$attempts" ] && sleep "$pause"
done
if [ -z "$body" ]; then
  if [ -n "$last" ]; then
    seen="stage=$(jq -r .stage <<<"$last" 2>/dev/null || echo '?') sha=$(jq -r .sha <<<"$last" 2>/dev/null || echo '?')"
    [ -z "$version" ] || seen="$seen version=$(jq -r .version <<<"$last" 2>/dev/null || echo '?')"
  else
    seen="no response"
  fi
  ver=""
  [ -n "$version" ] && ver=" version=$version"
  echo "::error::/api/health never answered stage=$stage sha=$sha$ver at $url (last: $seen)"
  exit 1
fi
echo "$body"
test "$(jq -r .ok <<<"$body")" = true
test "$(jq -r .stage <<<"$body")" = "$stage"
test "$(jq -r .sha <<<"$body")" = "$sha"
if [ -n "$version" ]; then
  test "$(jq -r .version <<<"$body")" = "$version"
fi
