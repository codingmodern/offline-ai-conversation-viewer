import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    // `strict` (not `recommended`) — required by code-standards.md §2.
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // code-standards.md §2: never `any`; explicit return types.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: false, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',

      // code-standards.md §2.1: no deep relative imports; use the `@/` alias.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message: 'Deep relative imports are forbidden. Use the `@/` alias instead.',
            },
          ],
        },
      ],

      // architecture.md Invariant #1: no network requests anywhere.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network access is forbidden (architecture.md Invariant #1).' },
        {
          name: 'XMLHttpRequest',
          message: 'Network access is forbidden (architecture.md Invariant #1).',
        },
      ],
    },
  },
  {
    // Config files run in Node and are not part of the app bundle.
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
