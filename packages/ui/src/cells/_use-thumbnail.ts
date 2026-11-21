import { useEffect, useRef, useState } from 'react';

type Pipeline = {
	readonly thumbnail: (src: string | Blob | Uint8Array, w: number, h: number) => Promise<Blob>;
};

let _pipelinePromise: Promise<Pipeline | null> | null = null;

async function _loadPipeline(): Promise<Pipeline | null> {
	if (_pipelinePromise !== null) return _pipelinePromise;
	_pipelinePromise = (async () => {
		try {
			const mod = await import('@tarbo-table/core-rs/image');
			return await mod.loadImagePipeline();
		} catch {
			return null;
		}
	})();
	return _pipelinePromise;
}

const _CACHE_MAX = 200;
const _cache = new Map<string, string>();

function _cacheGet(key: string): string | undefined {
	const v = _cache.get(key);
	if (v !== undefined) {
		_cache.delete(key);
		_cache.set(key, v);
	}
	return v;
}

function _cacheSet(key: string, url: string): void {
	if (_cache.has(key)) _cache.delete(key);
	_cache.set(key, url);
	while (_cache.size > _CACHE_MAX) {
		const oldest = _cache.keys().next().value;
		if (oldest === undefined) break;
		const old = _cache.get(oldest);
		_cache.delete(oldest);
		if (old !== undefined && old.startsWith('blob:')) URL.revokeObjectURL(old);
	}
}

export function useThumbnailUrl(src: string, width: number, height: number = width): string {
	const [resolved, setResolved] = useState<string>(() => {
		const key = `${src}|${width}x${height}`;
		return _cacheGet(key) ?? src;
	});
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (src === '' || src.startsWith('blob:')) {
			setResolved(src);
			return;
		}
		const key = `${src}|${width}x${height}`;
		const cached = _cacheGet(key);
		if (cached !== undefined) {
			setResolved(cached);
			return;
		}
		setResolved(src);
		let cancelled = false;
		(async () => {
			const p = await _loadPipeline();
			if (cancelled || p === null) return;
			const blob = await p.thumbnail(src, width * 2, height * 2);
			if (cancelled) return;
			const url = URL.createObjectURL(blob);
			_cacheSet(key, url);
			if (mountedRef.current) setResolved(url);
		})();
		return () => {
			cancelled = true;
		};
	}, [src, width, height]);

	return resolved;
}
