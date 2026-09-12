import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    // The engine is pure, deterministic and portable. Nothing here may reach
    // for ambient randomness, the clock, the DOM, or React.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random() is banned in src/engine. Draw from the seeded Rng instance instead — the whole run must be reproducible from its seed.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Date.now() is banned in src/engine. The engine must not read the clock.',
        },
        {
          object: 'crypto',
          property: 'getRandomValues',
          message: 'crypto.getRandomValues() is banned in src/engine. Use the seeded Rng.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Catches `const { random } = Math` and `Math['random']`, which slip past
          // no-restricted-properties.
          selector:
            "MemberExpression[object.name='Math'][property.value='random'], VariableDeclarator > ObjectPattern > Property[key.name='random']",
          message: 'Math.random is banned in src/engine, including aliased or computed access.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'new Date() is banned in src/engine. The engine must not read the clock.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/engine must not touch the DOM.' },
        { name: 'document', message: 'src/engine must not touch the DOM.' },
        { name: 'localStorage', message: 'src/engine must not perform I/O.' },
        { name: 'fetch', message: 'src/engine must not perform I/O.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'src/engine must not import React.' },
            { group: ['../ui/*', '../state/*', '@/ui/*', '@/state/*'], message: 'src/engine must not depend on UI or state layers.' },
          ],
        },
      ],
    },
  },
);
