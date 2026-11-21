import { _getVirtualRange } from './_virtual.ts';

export type VirtualRangeInput = {
	scrollTop: number;
	viewportHeight: number;
	rowHeight: number;
	overscan: number;
	totalRows: number;
};

export type VirtualRange = {
	startIdx: number;
	endIdx: number;
	paddingTop: number;
	paddingBottom: number;
};

export function getVirtualRange(input: VirtualRangeInput): VirtualRange {
	return _getVirtualRange(input);
}
