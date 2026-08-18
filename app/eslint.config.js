import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,

  // The server: plain JavaScript, ESM, Node globals.
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Express error middleware has to take four arguments even when the last
      // one is unused, so an underscore prefix opts a parameter out.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // The browser side: React and TypeScript.
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // An error, not a warning: a stale closure in the game loop is a real bug
      // and `npm run lint` is expected to be clean.
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Must stay last: turns off every rule Prettier already decides.
  prettier,
)
