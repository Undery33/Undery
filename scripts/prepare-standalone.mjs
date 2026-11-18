import { cp, mkdir } from "node:fs/promises";

// Dynamic Markdown queries must also work outside the source checkout.
await mkdir(".next/standalone/.next", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
await cp("content", ".next/standalone/content", { recursive: true });
await cp("build-info.json", ".next/standalone/build-info.json");
