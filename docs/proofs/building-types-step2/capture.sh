#!/usr/bin/env bash
# Native local renders; leaves frozen step-1 evidence untouched.
set -euo pipefail
out=docs/proofs/building-types-step2
capture() {
  local kind=$1 site=$2 profile=$3 seed=$4 camera=$5 mode=$6 name
  name="$site-$profile-$seed-$camera"
  cargo run -p city_bevy --example building_zoo -- \
    --type "$kind" --site "$site" --profile "$profile" --seed "$seed" \
    --camera "$camera" --screenshot "$out/$name.png" "$mode" \
    --export "$out/$name.json" > "$out/$name-runtime.txt" 2>&1
  printf '%s: exit 0\n' "$name"
}
capture townhouse-with-gate town_rectangle town_standard 7 oblique --interaction-smoke
capture townhouse-with-gate town_rectangle town_standard 7 rear --smoke-test
capture townhouse-with-gate town_rectangle town_standard 7 top --smoke-test
capture townhouse-with-gate town_rectangle town_standard 91 oblique --smoke-test
capture townhouse-with-gate town_rectangle town_compact 7 oblique --smoke-test
capture townhouse-with-gate town_irregular town_standard 7 oblique --smoke-test
capture townhouse-with-gate town_access town_access_profile 7 rear --smoke-test
capture townhouse-with-gate town_no_overhang town_flush 7 rear --smoke-test
capture house-with-annex irregular standard 7 oblique --smoke-test
bash docs/proofs/building-types-step1/check-capture-failure.sh "$out/capture-failure-runtime.txt"
