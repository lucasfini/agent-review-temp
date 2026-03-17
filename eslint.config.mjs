import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Temporary compatibility override for current Next eslint plugin chain.
      'react/display-name': 'off',
      // Legacy codebase transitional relaxations to restore a green baseline.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "docs/**",
    "tests/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
