import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /**
     * A leading underscore means "deliberately discarded".
     *
     * ── WHY THIS IS WORTH CONFIGURING ─────────────────────────────────────
     * The codebase drops keys by destructuring them into `_removed`,
     * `_dropped`, `_cleared` and friends, on purpose. Eleven of the twenty-
     * five warnings this repo reported were those — and the wall of noise had
     * a real one hiding in it: `getDesignNumbers` was imported into the quote
     * route and never called, so the six tests protecting the design-number
     * rule were testing a copy while the route computed its own. Lint had been
     * saying so for as long as it had been true, in a list nobody could read.
     *
     * A warning nobody reads is not a warning.
     * ──────────────────────────────────────────────────────────────────────
     */
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
