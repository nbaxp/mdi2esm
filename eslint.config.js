import path from 'node:path';

import css from '@eslint/css';
import js from '@eslint/js';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import html from '@html-eslint/eslint-plugin';
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config';
import prettier from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default defineConfig([
  includeIgnoreFile(path.resolve(import.meta.dirname, '.gitignore')),

  globalIgnores(['**/package-lock.json', '**/node_modules/**', '**/dist/**', '**/*.min.js', '**/*.min.css']),

  // JavaScript
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'spaced-comment': ['error', 'always'],
    },
  },

  // Vue SFC：只取 essential（正确性规则），排版交给 prettier
  // essential/rules 那一条不带 files，必须补上，否则会作用到 .css/.md 上
  ...pluginVue.configs['flat/essential'].map((config) => ({
    ...config,
    files: config.files ?? ['**/*.vue'],
  })),

  // CSS
  {
    files: ['**/*.css'],
    plugins: {
      css,
    },
    language: 'css/css',
    rules: {
      ...css.configs.recommended.rules,
      'css/no-important': 'off',
      'css/use-baseline': 'off',
      'css/no-invalid-properties': 'off',
      'css/font-family-fallbacks': 'off',
    },
  },

  // JSON
  {
    files: ['**/*.json'],
    language: 'json/json',
    ...json.configs.recommended,
  },

  // Markdown
  {
    plugins: {
      markdown,
    },
    extends: ['markdown/recommended'],
    files: ['**/*.md'],
    language: 'markdown/gfm',
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'markdown/fenced-code-language': 'off',
      'markdown/no-missing-label-refs': 'off',
    },
  },

  // HTML
  {
    files: ['**/*.html'],
    language: 'html/html',
    plugins: {
      html,
    },
    rules: {
      'html/no-duplicate-class': 'error',
    },
  },

  prettier,
]);
