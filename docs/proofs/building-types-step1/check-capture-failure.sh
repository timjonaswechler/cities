#!/usr/bin/env bash
# Local native regression: capture save errors must fail at the shell boundary.
# Run from repository root. /dev/null cannot contain a screenshot directory.
set -euo pipefail
log=${1:-docs/proofs/building-types-step1/capture-failure-runtime.txt}
if cargo run -p city_bevy --example building_zoo -- \
  --site rectangle --profile standard --seed 7 --camera oblique \
  --screenshot /dev/null/building-zoo.png --smoke-test > "$log" 2>&1; then
  printf 'ERROR: capture failure incorrectly returned exit 0\n'
  exit 1
else
  status=$?
fi
grep -F 'CAPTURE failed:' "$log"
printf 'observed_process_exit=%s\n' "$status" >> "$log"
test "$status" -eq 1
printf 'PASS: capture save failure returned exit 1\n'
