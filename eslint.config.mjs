import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', '.astro/', 'docs/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  { files: ['scripts/**', 'integrations/**', '*.config.*'], languageOptions: { globals: globals.node } },
  { files: ['src/**'], languageOptions: { globals: globals.browser } },
);
