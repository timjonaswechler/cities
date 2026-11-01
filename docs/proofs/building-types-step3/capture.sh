#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/Users/tim-jonaswechler/workspace/repositories/timjonaswechler/game/experimental/cities_generator/target}"
proof=docs/proofs/building-types-step3
cargo build -p city_bevy --bin city_bevy --example building_zoo
city="$CARGO_TARGET_DIR/debug/city_bevy"
zoo="$CARGO_TARGET_DIR/debug/examples/building_zoo"
config=assets/building-types/purplechurch.json
for seed in 7 91; do
  "$city" --seed 42 --size 25 --building-types "$config" --type-seed "$seed" --export "$proof/city-$seed.json"
done
python3 "$proof/verify.py" "$city" "$zoo"
for variant in original prototype; do
  extra=()
  if [[ "$variant" == prototype ]]; then extra=(--building-types "$config"); fi
  for view in overview detail; do
    camera=()
    if [[ "$view" == detail ]]; then camera=(--detail-lot 3:0); fi
    "$city" --seed 42 --size 25 ${extra[@]+"${extra[@]}"} ${camera[@]+"${camera[@]}"} --screenshot "$proof/$variant-$view.png" --smoke-test > "$proof/$variant-$view-runtime.txt" 2>&1
  done
done
"$city" --seed 42 --size 25 --building-types "$config" --type-seed 91 --detail-lot 3:0 --screenshot "$proof/prototype-detail-91.png" --smoke-test > "$proof/prototype-detail-91-runtime.txt" 2>&1
for variant in original prototype; do
  extra=()
  if [[ "$variant" == prototype ]]; then extra=(--building-types "$config"); fi
  "$city" --seed 42 --size 25 ${extra[@]+"${extra[@]}"} --detail-lot 3:2 --detail-rear --screenshot "$proof/$variant-rear-detail.png" --smoke-test > "$proof/$variant-rear-detail-runtime.txt" 2>&1
done
"$zoo" --request "$proof/request-7-1.json" --camera rear --screenshot "$proof/zoo-real-townhouse.png" --smoke-test > "$proof/zoo-real-townhouse-runtime.txt" 2>&1
