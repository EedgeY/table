import root from '../../eslint.config.js';

export default [
	...root,
	{
		ignores: ['pkg-node/**', 'pkg-web/**', 'target/**'],
	},
];
