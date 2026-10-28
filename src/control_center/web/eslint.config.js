/**
 * Lint rules for Brain's front end. The thresholds are the ones in spec 17.18 and are part of CI;
 * a rule is exceeded only with a suppression on that line that names the rule and gives a reason.
 */
import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/api/schema.d.ts", "public/sw.js"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, jsdoc },
    rules: {
      ...reactHooks.configs.recommended.rules,
      complexity: ["error", 10],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      "max-params": ["error", 5],
      "max-depth": ["error", 3],
      "max-lines": ["error", { max: 800 }],
      "no-console": "error",
      "no-warning-comments": ["error", { terms: ["todo", "fixme"], location: "start" }],
      "@typescript-eslint/no-explicit-any": "error",
      // Every file states what it is responsible for (17.18, "Module or file").
      "jsdoc/require-file-overview": "error",
      // Exported functions and components state their contract.
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: false },
          contexts: ["ExportNamedDeclaration > VariableDeclaration", "TSInterfaceDeclaration"],
        },
      ],
      "jsdoc/no-types": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "max-lines-per-function": "off",
      "jsdoc/require-jsdoc": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.js", "vite.config.ts"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
);
