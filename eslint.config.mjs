import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.wrangler-dist/**',
      '**/.turbo/**',
      '**/*.tsbuildinfo',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: {
      '@stylistic': stylistic,
      perfectionist,
    },
    rules: {
      'perfectionist/sort-imports': [
        'error',
        {
          type: 'alphabetical',
          order: 'asc',
          ignoreCase: true,
          partitionByNewLine: false,
          newlinesBetween: 0,
          newlinesInside: 0,
          groups: [
            'builtin',
            'external',
            'internal',
            'subpath',
            'parent',
            'sibling',
            'index',
            'type',
            'side-effect',
            'unknown',
          ],
          customGroups: [
            {
              groupName: 'internal',
              elementNamePattern: ['^@comvivati/', '^@/', '^#/'],
            },
          ],
        },
      ],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: '*',
          next: '*',
        },
        {
          blankLine: 'any',
          prev: 'import',
          next: 'import',
        },
      ],
    },
  },
  {
    files: ['**/cloudflare/worker.ts'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
];
