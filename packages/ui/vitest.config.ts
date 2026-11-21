import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		watch: false,
		globals: true,
		environment: 'jsdom',
		includeSource: ['src/**/*.{ts,tsx}'],
		passWithNoTests: true,
	},
});
