export const logger = Object.freeze({
	info: (...args: unknown[]): void => {
		if (typeof console !== 'undefined' && typeof console.info === 'function') {
			console.info(...args);
		}
	},
	warn: (...args: unknown[]): void => {
		if (typeof console !== 'undefined' && typeof console.warn === 'function') {
			console.warn(...args);
		}
	},
	error: (...args: unknown[]): void => {
		if (typeof console !== 'undefined' && typeof console.error === 'function') {
			console.error(...args);
		}
	},
});
