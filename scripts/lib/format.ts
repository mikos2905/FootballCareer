export function pad(value: string | number, width: number, align: 'l' | 'r' = 'l'): string {
  const s = String(value);
  if (s.length >= width) return s.slice(0, width);
  return align === 'l' ? s.padEnd(width) : s.padStart(width);
}

export function money(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}bn`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const lowValue = sorted[low] ?? 0;
  if (low === high) return lowValue;
  const highValue = sorted[high] ?? lowValue;
  return lowValue + (highValue - lowValue) * (index - low);
}

export function describe(label: string, values: number[], fractionDigits = 1): string {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
  const f = (n: number) => n.toFixed(fractionDigits);
  return [
    pad(label, 26),
    pad(`mean ${f(mean)}`, 13),
    pad(`p10 ${f(percentile(sorted, 0.1))}`, 12),
    pad(`p50 ${f(percentile(sorted, 0.5))}`, 12),
    pad(`p90 ${f(percentile(sorted, 0.9))}`, 12),
    pad(`p99 ${f(percentile(sorted, 0.99))}`, 12),
  ].join('');
}

/**
 * A crude bimodality check: compare the density in the valley between the two
 * dominant peaks against the weaker peak. The brief asks that nothing be
 * accidentally bimodal, so this flags candidates to look at rather than
 * proving anything.
 */
export function bimodalityFlag(values: number[], bins = 24): boolean {
  if (values.length < 100) return false;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return false;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  const smoothed = counts.map((_, i) => {
    const window = [counts[i - 1] ?? 0, counts[i] ?? 0, counts[i + 1] ?? 0];
    return window.reduce((a, b) => a + b, 0) / 3;
  });
  const peaks: number[] = [];
  for (let i = 1; i < bins - 1; i += 1) {
    const prev = smoothed[i - 1] ?? 0;
    const cur = smoothed[i] ?? 0;
    const next = smoothed[i + 1] ?? 0;
    if (cur > prev && cur >= next && cur > values.length / bins / 2) peaks.push(i);
  }
  if (peaks.length < 2) return false;
  peaks.sort((a, b) => (smoothed[b] ?? 0) - (smoothed[a] ?? 0));
  const a = peaks[0] as number;
  const b = peaks[1] as number;
  if (Math.abs(a - b) < 3) return false;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let valley = Infinity;
  for (let i = lo; i <= hi; i += 1) valley = Math.min(valley, smoothed[i] ?? 0);
  const weaker = Math.min(smoothed[a] ?? 0, smoothed[b] ?? 0);
  return valley < weaker * 0.55;
}

export function histogram(values: number[], bins = 20, width = 46): string[] {
  if (values.length === 0) return ['(no data)'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return [`all values = ${min}`];
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  const peak = Math.max(...counts);
  return counts.map((count, i) => {
    const lo = min + ((max - min) / bins) * i;
    const hi = min + ((max - min) / bins) * (i + 1);
    const bar = '#'.repeat(Math.round((count / peak) * width));
    const share = ((count / values.length) * 100).toFixed(1);
    return `${pad(lo.toFixed(1), 8, 'r')}..${pad(hi.toFixed(1), 8, 'l')} ${pad(count, 7, 'r')} ${pad(`${share}%`, 7, 'r')}  ${bar}`;
  });
}
