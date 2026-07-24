// Plan 3 Phase 5: Next 16 removed `next lint` — eslint-config-next@16 ships
// native ESLint 9 flat configs, imported directly (no FlatCompat needed).
// Lint scope matches `next lint`'s default directories via the package.json
// script (`eslint app components lib`; this repo has no pages/ or src/).
import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...coreWebVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // react-hooks v6 (React Compiler) rules newly enabled by
      // eslint-config-next@16. Everything they flag pre-dates the Next 16
      // upgrade (Plan 3 Phase 5 is behavior-preserving) — fixing those
      // patterns is separate refactor work, so restore lint parity with the
      // previous `next lint` (eslint-config-next@14) baseline.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      // The v14 `next lint` did not flag this repo's deliberate styled <a>
      // links to internal pages; keep parity (converting them to <Link> is a
      // behavior change out of upgrade scope).
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];

export default eslintConfig;
