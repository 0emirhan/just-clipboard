#!/usr/bin/env bash
# Run the pure-JS test suite with gjs.
set -e
cd "$(dirname "$0")/.."

failed=0
for test in tests/*.test.js; do
  echo
  if ! gjs -m "$test"; then
    failed=$((failed + 1))
  fi
done

echo
if [ "$failed" -eq 0 ]; then
  echo "All test files passed."
  exit 0
else
  echo "$failed test file(s) failed."
  exit 1
fi
