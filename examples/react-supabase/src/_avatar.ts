const _cache = new Map<number, string>();

const _PALETTES: ReadonlyArray<readonly [number, number]> = [
	[265, 200],
	[10, 35],
	[145, 175],
	[40, 75],
	[300, 330],
	[210, 240],
	[85, 110],
	[350, 25],
	[180, 210],
	[55, 90],
];

function _initials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function makeAvatar(seed: number, name: string): string {
	const cached = _cache.get(seed);
	if (cached !== undefined) return cached;

	const canvas = document.createElement('canvas');
	canvas.width = 200;
	canvas.height = 200;
	const ctx = canvas.getContext('2d');
	if (ctx === null) return '';

	const [h1, h2] = _PALETTES[seed % _PALETTES.length]!;

	const grad = ctx.createLinearGradient(0, 0, 200, 200);
	grad.addColorStop(0, `hsl(${h1}, 65%, 55%)`);
	grad.addColorStop(1, `hsl(${h2}, 70%, 45%)`);
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, 200, 200);

	ctx.fillStyle = 'rgba(255,255,255,0.18)';
	ctx.beginPath();
	ctx.arc(60 + (seed % 30), 50 + ((seed * 7) % 30), 70, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = 'rgba(255,255,255,0.95)';
	ctx.font = 'bold 84px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(_initials(name), 100, 110);

	const url = canvas.toDataURL('image/png');
	_cache.set(seed, url);
	return url;
}
