/**
 * @fileoverview Image processing adapter — lazily loads the `image-wasm`
 * bundle on demand. The pipeline bundle (filter/sort/page) is **not** loaded
 * by this module, so apps that never touch image cells pay zero cost.
 *
 * Usage:
 * ```ts
 * import { loadImagePipeline } from '@tarbo-table/core-rs/image';
 *
 * const pipeline = await loadImagePipeline();
 * const blob = await pipeline.thumbnail('https://example.com/photo.jpg', 64, 64);
 * imgEl.src = URL.createObjectURL(blob);
 * ```
 *
 * @module @tarbo-table/core-rs/image
 */

export type ImageFmt = 'jpeg' | 'png' | 'webp';
export type FitMode = 'cover' | 'contain' | 'stretch';

export type CompressOptions = {
	readonly fmt?: ImageFmt;
	readonly maxDim?: number;
	readonly quality?: number;
};

export type ThumbnailOptions = {
	readonly fit?: FitMode;
	readonly quality?: number;
};

type Surface = {
	readonly img_compress: (
		src: Uint8Array,
		fmt: number,
		max_dim: number,
		quality: number,
	) => Uint8Array;
	readonly img_thumbnail: (
		src: Uint8Array,
		w: number,
		h: number,
		fit: number,
		quality: number,
	) => Uint8Array;
	readonly img_blurhash: (src: Uint8Array, x: number, y: number) => string;
	readonly img_decode_dimensions: (src: Uint8Array) => Uint32Array;
};

function _fmtCode(fmt: ImageFmt | undefined): number {
	switch (fmt) {
		case 'png':
			return 1;
		case 'webp':
			return 2;
		case 'jpeg':
		case undefined:
			return 0;
	}
}

function _fitCode(fit: FitMode | undefined): number {
	switch (fit) {
		case 'contain':
			return 1;
		case 'stretch':
			return 2;
		case 'cover':
		case undefined:
			return 0;
	}
}

function _mimeFor(fmt: ImageFmt | undefined): string {
	switch (fmt) {
		case 'png':
			return 'image/png';
		case 'webp':
			return 'image/webp';
		case 'jpeg':
		case undefined:
			return 'image/jpeg';
	}
}

async function _toBytes(src: Uint8Array | Blob | string): Promise<Uint8Array> {
	if (src instanceof Uint8Array) return src;
	if (typeof Blob !== 'undefined' && src instanceof Blob) {
		const ab = await src.arrayBuffer();
		return new Uint8Array(ab);
	}
	if (typeof src === 'string') {
		const res = await fetch(src);
		if (!res.ok) throw new Error(`fetch ${src}: ${res.status}`);
		const ab = await res.arrayBuffer();
		return new Uint8Array(ab);
	}
	throw new Error('unsupported image source type');
}

let _surfacePromise: Promise<Surface> | null = null;

function _isNode(): boolean {
	return (
		typeof process !== 'undefined' &&
		typeof process.versions !== 'undefined' &&
		typeof process.versions.node === 'string'
	);
}

async function _loadSurface(): Promise<Surface> {
	if (_surfacePromise !== null) return _surfacePromise;
	_surfacePromise = (async () => {
		if (_isNode()) {
			const mod = await import('../pkg-node-image/tarbo_table_core_rs.js');
			return mod as unknown as Surface;
		}
		const mod = await import('../pkg-web-image/tarbo_table_core_rs.js');
		const initFn = (mod as { default?: () => Promise<unknown> }).default;
		if (typeof initFn === 'function') {
			await initFn();
		}
		return mod as unknown as Surface;
	})();
	return _surfacePromise;
}

export class ImagePipeline {
	readonly #s: Surface;

	constructor(surface: Surface) {
		this.#s = surface;
	}

	/**
	 * Decode `src` and re-encode in the requested format. Optionally caps the
	 * largest dimension at `maxDim`.
	 */
	async compress(src: Uint8Array | Blob | string, opts: CompressOptions = {}): Promise<Uint8Array> {
		const bytes = await _toBytes(src);
		const fmt = opts.fmt ?? 'jpeg';
		const quality = opts.quality ?? 80;
		const maxDim = opts.maxDim ?? 0;
		return this.#s.img_compress(bytes, _fmtCode(fmt), maxDim, quality);
	}

	/**
	 * Produce a W×H JPEG thumbnail. Returns a `Blob` so it can be fed directly
	 * to `URL.createObjectURL` for `<img>` rendering.
	 */
	async thumbnail(
		src: Uint8Array | Blob | string,
		width: number,
		height: number,
		opts: ThumbnailOptions = {},
	): Promise<Blob> {
		const bytes = await _toBytes(src);
		const fit = opts.fit ?? 'cover';
		const quality = opts.quality ?? 75;
		const out = this.#s.img_thumbnail(bytes, width, height, _fitCode(fit), quality);
		// Copy into a fresh ArrayBuffer to satisfy the strict BlobPart type
		// (wasm-bindgen returns Uint8Array<ArrayBufferLike>).
		return new Blob([new Uint8Array(out)], { type: 'image/jpeg' });
	}

	/**
	 * Encode a blurhash placeholder. `x`/`y` are AC component counts (3..9 typical).
	 */
	async blurhash(src: Uint8Array | Blob | string, x = 4, y = 3): Promise<string> {
		const bytes = await _toBytes(src);
		return this.#s.img_blurhash(bytes, x, y);
	}

	/**
	 * Cheap probe of (width, height) without full decode.
	 * Returns `null` if the format is not recognized.
	 */
	async decodeDimensions(
		src: Uint8Array | Blob | string,
	): Promise<{ width: number; height: number } | null> {
		const bytes = await _toBytes(src);
		const out = this.#s.img_decode_dimensions(bytes);
		if (out.length < 2) return null;
		return { width: out[0]!, height: out[1]! };
	}

	dataUrl(bytes: Uint8Array, fmt: ImageFmt = 'jpeg'): string {
		const blob = new Blob([new Uint8Array(bytes)], { type: _mimeFor(fmt) });
		return URL.createObjectURL(blob);
	}
}

/**
 * Resolve to a shared `ImagePipeline` instance. The wasm bundle is loaded on
 * first call and cached for the lifetime of the page / process.
 */
export async function loadImagePipeline(): Promise<ImagePipeline> {
	const surface = await _loadSurface();
	return new ImagePipeline(surface);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	const _PNG_1X1 = Uint8Array.from(
		atob(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
		),
		(c) => c.charCodeAt(0),
	);

	describe('image pipeline (node bundle)', () => {
		it('decodes 1×1 PNG dimensions', async () => {
			const pipeline = await loadImagePipeline();
			const dims = await pipeline.decodeDimensions(_PNG_1X1);
			expect(dims).toEqual({ width: 1, height: 1 });
		});

		it('compress PNG → JPEG produces SOI marker', async () => {
			const pipeline = await loadImagePipeline();
			const jpg = await pipeline.compress(_PNG_1X1, { fmt: 'jpeg', quality: 80 });
			expect(jpg.length).toBeGreaterThan(0);
			expect(jpg[0]).toBe(0xff);
			expect(jpg[1]).toBe(0xd8);
		});

		it('thumbnail returns a JPEG Blob', async () => {
			const pipeline = await loadImagePipeline();
			const blob = await pipeline.thumbnail(_PNG_1X1, 8, 8);
			expect(blob.type).toBe('image/jpeg');
			expect(blob.size).toBeGreaterThan(0);
		});

		it('blurhash returns a non-empty string', async () => {
			const pipeline = await loadImagePipeline();
			const hash = await pipeline.blurhash(_PNG_1X1, 4, 3);
			expect(hash.length).toBeGreaterThan(0);
		});
	});
}
