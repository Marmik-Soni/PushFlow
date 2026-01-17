import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-n';
import promisePlugin from 'eslint-plugin-promise';

export default [
  js.configs.recommended,
  {
    plugins: {
      import: importPlugin,
      n: nodePlugin,
      promise: promisePlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['warn', 'always'],
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'import/order': [
        'warn',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        Notification: 'readonly',
        self: 'readonly',
        clients: 'readonly',
        caches: 'readonly',
        ServiceWorkerGlobalScope: 'readonly',
        crypto: 'readonly',
        btoa: 'readonly',
      },
    },
  },
  {
    ignores: ['node_modules/**', 'pnpm-lock.yaml', '.husky/**'],
  },
  prettierConfig,
];
