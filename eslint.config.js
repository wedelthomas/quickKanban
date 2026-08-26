import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
