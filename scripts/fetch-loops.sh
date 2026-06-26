#!/usr/bin/env bash
# Phase 7 — download a DIVERSE set of CC0 / royalty-free loops into assets/loops/.
# Each loop is a different genre/instrument so the Loop puck cycles through distinct sounds.
# archive.org URLs 302-redirect to a datanode, so we follow redirects (curl -L).
# Run from the project root:  bash scripts/fetch-loops.sh
set -euo pipefail

DEST="assets/loops"
mkdir -p "$DEST"

# outname|url   (one per line)
LOOPS='
breakbeat_108.mp3|https://archive.org/download/108_bpm_breakbeat_to_use/Sample00_108_BPM_EatMe_drums_-_2016_-_samples_-_music_by_EatMe_-_www.eatme.pro_-_drums_recorded_with_2_overhead_microphones_through_mix_amp_on_minidisc_to_computer..mp3
house_140.wav|https://archive.org/download/VeryGrimLoopPack1/140401drumz.wav
bass_funk.wav|https://freewavesamples.com/files/Alesis-Fusion-Bass-Loop.wav
arp_130.ogg|https://upload.wikimedia.org/wikipedia/commons/5/53/Bauchamp_-_130_arpeggio_rock.ogg
samba_perc.wav|https://freewavesamples.com/files/Casio-MT-45-Samba.wav
piano_chords.wav|https://archive.org/download/GrimyGrimLoopPack/GrimyGrimStringPiano.wav
'

fail=0
while IFS='|' read -r out url; do
  [ -z "$out" ] && continue
  echo "Downloading $out ..."
  if curl -sL --fail --max-time 120 -o "$DEST/$out" "$url"; then
    if [ -s "$DEST/$out" ]; then
      echo "  ok ($(wc -c < "$DEST/$out") bytes)"
    else
      echo "  ERROR: $out is empty" >&2; fail=1
    fi
  else
    echo "  ERROR: failed to download $out" >&2; fail=1
  fi
done <<EOF
$LOOPS
EOF

cat > "$DEST/LICENSE.md" <<'EOF'
# Loop pack license

Diverse loop set, per file:

- breakbeat_108.mp3 — archive.org "108_bpm_breakbeat_to_use" (EatMe) — CC0 1.0 (public domain)
- house_140.wav     — archive.org "VeryGrimLoopPack1" — CC0 1.0 (public domain)
- bass_funk.wav     — freewavesamples.com (Alesis Fusion Bass Loop) — royalty-free, commercial OK, no attribution required
- arp_130.ogg       — Wikimedia Commons "Bauchamp - 130 arpeggio rock" — CC0 (public domain)
- samba_perc.wav    — freewavesamples.com (Casio MT-45 Samba) — royalty-free, commercial OK, no attribution required
- piano_chords.wav  — archive.org "GrimyGrimLoopPack" — CC0 1.0 (public domain)

All are CC0 or explicitly royalty-free with no attribution required. This file is our record.
Downloaded by scripts/fetch-loops.sh.
EOF

if [ "$fail" -ne 0 ]; then
  echo "One or more loops failed to download." >&2
  exit 1
fi
echo "All loops downloaded to $DEST/"
