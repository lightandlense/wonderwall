#!/usr/bin/env bash
# Phase 7 — download the curated CC0/royalty-free loop pack into assets/loops/.
# Source: GareBear99/Free-Future-Bass-Producer-Kit (GitHub, branch main).
# License: "Free to use in personal and commercial projects. No credit required."
# Run from the project root:  bash scripts/fetch-loops.sh
set -euo pipefail

BASE="https://raw.githubusercontent.com/GareBear99/Free-Future-Bass-Producer-Kit/main/FutureBassKit/loops"
DEST="assets/loops"
mkdir -p "$DEST"

FILES=(
  "LoFi_HipHop_85bpm_01.wav"
  "BoomBap_90bpm_01.wav"
  "Afrobeats_100bpm_01.wav"
  "House_124bpm_01.wav"
  "Trap_140bpm_01.wav"
  "FutureBass_150bpm_01.wav"
)

fail=0
for f in "${FILES[@]}"; do
  out="$DEST/$f"
  echo "Downloading $f ..."
  if curl -sL --fail --max-time 60 -o "$out" "$BASE/$f"; then
    if [ ! -s "$out" ]; then
      echo "  ERROR: $f downloaded but is empty" >&2
      fail=1
    else
      sz=$(wc -c < "$out")
      echo "  ok ($sz bytes)"
    fi
  else
    echo "  ERROR: failed to download $f" >&2
    fail=1
  fi
done

cat > "$DEST/LICENSE.md" <<'EOF'
# Loop pack license

Source: https://github.com/GareBear99/Free-Future-Bass-Producer-Kit (branch `main`)

License (from the repo README — no LICENSE file exists upstream):

> Free to use in personal and commercial projects. No credit required but
> appreciated. All sounds are 100% original — synthesized from scratch.

Royalty-free, commercial use permitted, attribution optional. This file is our
record of those terms. Downloaded by `scripts/fetch-loops.sh`.
EOF

if [ "$fail" -ne 0 ]; then
  echo "One or more loops failed to download." >&2
  exit 1
fi
echo "All loops downloaded to $DEST/"
