import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The cucumber config has to be CommonJS — cucumber reads it with require —
    // so `module` is a real global there, not an undefined reference.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
  {
    rules: {
      'no-console': ['error', { allow: ['error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          // Omitting a property by destructuring is a deliberate discard, not
          // an oversight: `const { title, ...rest } = input`.
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
