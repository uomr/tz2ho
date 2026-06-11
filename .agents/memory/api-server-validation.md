---
name: API Server Validation
description: Why zod cannot be imported directly in api-server routes and what to use instead
---

## Rule
Never `import { z } from "zod"` or `import { z } from "zod/v4"` inside any file under `artifacts/api-server/src/`. esbuild will fail at build time with "Could not resolve zod".

**Why:** `zod` is not listed in `artifacts/api-server/package.json` dependencies. The api-server uses esbuild to bundle, so all imports must resolve.

**How to apply:**
- Use plain manual validation functions (check string length, regex, etc.)
- OR import validated types/schemas from `@workspace/api-zod` which is already in dependencies
- The `lib/db` package CAN use `zod/v4` because it's a library, not bundled by esbuild in the same way
