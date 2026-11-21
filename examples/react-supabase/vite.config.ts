import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const wsAliases = [
	{
		find: /^@tarbo-table\/ui$/,
		replacement: path.join(root, 'packages/ui/src/index.ts'),
	},
	{
		find: /^@tarbo-table\/ui\/(.*)$/,
		replacement: path.join(root, 'packages/ui/src/$1'),
	},
	{
		find: /^@tarbo-table\/core$/,
		replacement: path.join(root, 'packages/core/src/index.ts'),
	},
	{
		find: /^@tarbo-table\/core\/(.+)$/,
		replacement: path.join(root, 'packages/core/src/$1.ts'),
	},
];

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: { port: 5174, open: true },
	build: { target: 'esnext' },
	resolve: {
		alias: wsAliases,
	},
	optimizeDeps: {
		exclude: ['@tarbo-table/core', '@tarbo-table/ui'],
	},
});
