import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['./src/*.ts', '!./src/**/*.test.ts', '!./src/_*.ts'],
	outDir: 'dist',
	format: 'esm',
	clean: true,
	sourcemap: true,
	dts: { tsgo: true },
	minify: 'dce-only',
	treeshake: { moduleSideEffects: false },
	publint: true,
	nodeProtocol: true,
	define: { 'import.meta.vitest': 'undefined' },
	fixedExtension: false,
	inputOptions: {
		preserveEntrySignatures: 'strict',
	},
	outputOptions: {
		comments: { legal: false, annotation: true, jsdoc: false },
	},
});
