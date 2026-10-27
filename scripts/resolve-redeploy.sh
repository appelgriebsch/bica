#!/usr/bin/env bash
# Redeploy resolution for Deploy. Env: ARTIFACT_RUN_ID, REPOSITORY, GITHUB_OUTPUT, GH_TOKEN.
set -euo pipefail

if ! [[ "${ARTIFACT_RUN_ID:-}" =~ ^[0-9]{1,20}$ ]]; then
  echo "::error::artifact_run_id must match ^[0-9]{1,20}$"
  exit 1
fi

meta=$(gh api "repos/$REPOSITORY/actions/runs/$ARTIFACT_RUN_ID")
path=$(jq -r .path <<<"$meta")
branch=$(jq -r .head_branch <<<"$meta")
full=$(jq -r .repository.full_name <<<"$meta")
if [ "$path" != ".github/workflows/deploy.yml" ] || [ "$branch" != "main" ] || [ "$full" != "$REPOSITORY" ]; then
  echo "::error::run $ARTIFACT_RUN_ID is not a Deploy run on main of $REPOSITORY (path=$path branch=$branch repo=$full)"
  exit 1
fi

arts=$(gh api "repos/$REPOSITORY/actions/runs/$ARTIFACT_RUN_ID/artifacts")
count=$(jq -r '[.artifacts[] | select(.expired == false) | .name | select(test("^bica-worker-[0-9a-f]{40}$"))] | length' <<<"$arts")
if [ "$count" != 1 ]; then
  echo "::error::expected exactly one non-expired bica-worker-<sha> artifact on run $ARTIFACT_RUN_ID (retention is 30 days); found $count"
  exit 1
fi
artifact=$(jq -r '.artifacts[] | select(.expired == false) | .name | select(test("^bica-worker-[0-9a-f]{40}$"))' <<<"$arts")
sha=${artifact#bica-worker-}
if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::sha must match ^[0-9a-f]{40}$, got $sha"
  exit 1
fi

status=$(gh api "repos/$REPOSITORY/compare/${sha}...main" | jq -r .status)
if [ "$status" != "identical" ] && [ "$status" != "ahead" ]; then
  echo "::error::$sha is not on main's history (compare status=$status)"
  exit 1
fi

{
  echo "mode=redeploy"
  echo "sha=$sha"
  echo "artifact=$artifact"
  echo "run_id=$ARTIFACT_RUN_ID"
} >> "$GITHUB_OUTPUT"
echo "redeploy $artifact from run $ARTIFACT_RUN_ID"
