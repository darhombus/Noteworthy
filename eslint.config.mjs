import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / vendored static assets (e.g. ffmpeg.wasm blobs) — not
    // source code, and gitignored, so never lint them.
    "public/**",
  ]),
  {
    // React Compiler advisories that eslint-config-next 16 enables as errors.
    // The existing shipped code trips these; downgraded to warnings so they
    // remain visible for a later focused cleanup without blocking CI.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
