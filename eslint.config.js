import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'**/dist/**',
			'**/node_modules/**',
			'**/.tsdown/**',
			'**/pkg-node/**',
			'**/pkg-web/**',
			'**/pkg-node-image/**',
			'**/pkg-web-image/**',
			'.claude/**',
			'eslint.config.d.ts',
		],
	},
	{
		linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
			],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'separate-type-imports' },
			],
			'@typescript-eslint/no-explicit-any': 'error',
			'no-console': ['error', { allow: ['warn', 'error'] }],
			eqeqeq: ['error', 'smart'],
		},
	},
	{
		files: ['**/*.tsx'],
		ignores: ['examples/**'],
		rules: {
			'no-restricted-properties': [
				'error',
				{
					object: 'Math',
					property: 'random',
					message:
						'Math.random() in a component changes on every render and differs between SSR and CSR. Use useId() from react for DOM ids.',
				},
			],
		},
	},
	{
		files: ['**/_logger.ts'],
		rules: {
			'no-console': 'off',
		},
	},
	{
		files: ['**/*.config.{js,ts}', 'eslint.config.js'],
		rules: {
			'no-console': 'off',
		},
	},
);
