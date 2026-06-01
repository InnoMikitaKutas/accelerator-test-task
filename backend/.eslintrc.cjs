module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: 'tsconfig.json', tsconfigRootDir: __dirname, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.cjs', 'dist', 'node_modules', 'drizzle', 'jest.config.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
    // TENANCY CONVENTION (architect review R-lint): tenant-owned tables must only be
    // queried through ScopedRepository / sanctioned tenancy helpers. Raw imports of these
    // table symbols outside src/shared/tenancy/** or *.repository.ts are forbidden.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['*/schema/associations', '*/schema/sharelinks', '*/schema/branding'],
            message:
              'Tenant-owned tables must be accessed via a *.repository.ts or src/shared/tenancy/**. Do not import them directly here.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.repository.ts', 'src/shared/tenancy/**/*.ts', 'src/shared/database/**/*.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
