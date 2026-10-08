import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
  }),
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      'node_modules/**',
      'public/maplibre/**', // Generated upstream bundles, not application source.
      'next-env.d.ts',
    ],
  },
  {
    files: ['mobile/scripts/*.cjs', 'mobile/tests/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [
      'src/lib/prisma.ts',
      'src/lib/ica-master-auth.ts',
      'src/lib/security.ts',
      'src/app/api/health/route.ts',
      'src/app/api/storage/**/*.ts',
      'src/app/api/stream/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default eslintConfig;
