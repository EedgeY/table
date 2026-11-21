import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['./src/index.ts'],
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
	external: ['react', 'react-dom', 'react/jsx-runtime', '@tarbo-table/core'],
	inputOptions: {
		preserveEntrySignatures: 'strict',
	},
	outputOptions: {
		comments: { legal: false, annotation: true, jsdoc: false },
	},
});
