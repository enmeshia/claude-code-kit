---
paths:
  - "src/**/*.test.ts"
  - "tests/**"
---

# Tests

<!-- An example of a path-scoped rule, not installed. It loads only when Claude reads a file that
matches one of the globs above. Copy it to .claude/rules/testing.md, point the globs at the
project's test files, and replace the runner and commands with the real ones. -->

Vitest. Run one file with `npx vitest run <file>`, all with `npm test`.

- **Test through the real entry point.** Call the route, the command or the component the user
  touches, not the helper behind it. A test that skips the real wiring passes when the feature is
  broken.
- **Check what must not happen** with the same input, not only what must.
- **Wait for a condition, not a fixed time.** Re-run once before believing a single odd failure;
  if it repeats, it is real.
- **A test that passes alone but fails in the full run** means the one before it left state behind.
  Fix the reset, not the check.
