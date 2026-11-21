import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: ['packages/*/vitest.config.ts'],
		passWithNoTests: true,
		watch: false,
		reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default'],
	},
});
