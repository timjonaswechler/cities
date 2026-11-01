#!/usr/bin/env bash
# Run from the repository root. Local GPU renders only; never starts CI.
set -euo pipefail
out=docs/proofs/building-types-step1
capture() {
  local site=$1 profile=$2 seed=$3 camera=$4 mode=$5 name
  name="$site-$profile-$seed"
  if [[ $camera != oblique ]]; then name="$name-$camera"; fi
  cargo run -p city_bevy --example building_zoo -- \
    --type house-with-annex --site "$site" --profile "$profile" --seed "$seed" \
    --camera "$camera" --screenshot "$out/$name.png" "$mode" \
    --export "$out/$name.json" > "$out/$name-runtime.txt" 2>&1
  printf '%s: exit 0\n' "$name"
}
capture rectangle standard 7 oblique --interaction-smoke
capture irregular standard 7 oblique --smoke-test
capture rectangle compact 91 oblique --smoke-test
capture rear_access access 7 oblique --smoke-test
capture irregular standard 7 top --smoke-test
capture rectangle standard 7 rear --smoke-test
capture rectangle standard 91 oblique --smoke-test
