import type { CellMeta } from '@tarbo-table/core';
import { ImageOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../_utils.ts';
import { useThumbnailUrl } from './_use-thumbnail.ts';

export type ImageCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'image' }>;
	readonly size?: number;
	readonly className?: string;
	/** false にすると Rust パイプラインを使わず素の `<img>` で描画する。既定 true。 */
	readonly thumbnail?: boolean;
};

export function ImageCell(props: ImageCellProps): ReactNode {
	const { meta, size = 22, className, thumbnail = true } = props;
	const [errored, setErrored] = useState(false);
	const resolvedSrc = useThumbnailUrl(thumbnail ? meta.src : '', size);
	const finalSrc = thumbnail ? resolvedSrc : meta.src;

	if (errored) {
		return (
			<span
				className={cn(
					'inline-flex items-center justify-center rounded border border-border bg-muted text-muted-foreground',
					className,
				)}
				style={{ width: size, height: size }}
				aria-label={meta.alt ?? 'image unavailable'}
			>
				<ImageOff className="h-3 w-3" />
			</span>
		);
	}

	return (
		<img
			src={finalSrc}
			alt={meta.alt ?? ''}
			loading="lazy"
			decoding="async"
			width={meta.width ?? size}
			height={meta.height ?? size}
			onError={() => setErrored(true)}
			className={cn(
				'inline-block rounded border border-border object-cover align-middle',
				className,
			)}
			style={{ width: size, height: size }}
		/>
	);
}
