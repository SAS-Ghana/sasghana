import { useId } from "react";

type Point = [number, number];

/** Catmull-Rom to cubic-bezier smoothing -- keeps the hand-rolled-SVG approach used by menu-icon.tsx
    and dashboard-insights.tsx rather than pulling in a charting library. */
function smoothPath(points: Point[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function niceMaxOf(values: number[]) { return Math.ceil(Math.max(1, ...values) / 4) * 4 || 4; }
function axisTicks(niceMax: number) { return [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f)); }

export type ChartSeries = { name: string; color: string; values: number[] };

export function AreaChart({ series, xLabels, height = 240, legend = true }: { series: ChartSeries[]; xLabels: string[]; height?: number; legend?: boolean }) {
  const gradId = useId();
  const width = 640, padLeft = 30, padRight = 12, padTop = 12, padBottom = 24;
  const innerW = width - padLeft - padRight, innerH = height - padTop - padBottom;
  const niceMax = niceMaxOf(series.flatMap((s) => s.values));
  const n = Math.max(1, xLabels.length);
  const xAt = (i: number) => padLeft + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padTop + innerH - (v / niceMax) * innerH;

  return <div className="dhv2-area-chart">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Trend chart">
      {axisTicks(niceMax).map((tick) => <g key={tick}>
        <line x1={padLeft} x2={width - padRight} y1={yAt(tick)} y2={yAt(tick)} className="dhv2-chart-gridline" />
        <text x={padLeft - 8} y={yAt(tick)} className="dhv2-chart-axis-label" textAnchor="end" dominantBaseline="middle">{tick}</text>
      </g>)}
      {xLabels.map((label, i) => <text key={label + i} x={xAt(i)} y={height - 4} className="dhv2-chart-axis-label" textAnchor="middle">{label}</text>)}
      {series.map((s, seriesIndex) => {
        const points = s.values.map((v, i) => [xAt(i), yAt(v)] as Point);
        const linePath = smoothPath(points);
        const areaPath = points.length ? `${linePath} L ${xAt(points.length - 1)},${yAt(0)} L ${xAt(0)},${yAt(0)} Z` : "";
        const id = `${gradId}-${seriesIndex}`;
        return <g key={s.name}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient></defs>
          <path d={areaPath} fill={`url(#${id})`} stroke="none" />
          <path d={linePath} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>;
      })}
    </svg>
    {legend && <div className="dhv2-chart-legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
  </div>;
}

export type DonutSlice = { name: string; value: number; color: string };

export function DonutChart({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel?: { name: string; value: number } }) {
  const size = 200, cx = size / 2, cy = size / 2, r = 72, strokeWidth = 22;
  const circumference = 2 * Math.PI * r;
  const total = Math.max(1, slices.reduce((sum, s) => sum + s.value, 0));
  const segments = slices.map((s, index) => {
    const segLen = (s.value / total) * circumference;
    const start = slices.slice(0, index).reduce((sum, prior) => sum + (prior.value / total) * circumference, 0);
    return { ...s, segLen, start };
  });
  return <div className="dhv2-donut-wrap">
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Distribution chart">
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segments.map((s) => <circle key={s.name} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={strokeWidth} strokeDasharray={`${s.segLen} ${circumference - s.segLen}`} strokeDashoffset={-s.start} />)}
      </g>
    </svg>
    {centerLabel && <div className="dhv2-donut-tooltip"><strong>{centerLabel.name}</strong>&nbsp;: {centerLabel.value}</div>}
  </div>;
}

export function BarChart({ values, xLabels, height = 200 }: { values: number[]; xLabels: string[]; height?: number }) {
  const width = 560, padLeft = 30, padRight = 12, padTop = 12, padBottom = 24;
  const innerW = width - padLeft - padRight, innerH = height - padTop - padBottom;
  const niceMax = niceMaxOf(values);
  const n = Math.max(1, values.length);
  const slot = innerW / n;
  const barWidth = Math.min(28, slot * 0.5);

  return <svg viewBox={`0 0 ${width} ${height}`} className="dhv2-bar-chart" role="img" aria-label="Bar chart">
    {axisTicks(niceMax).map((tick) => { const y = padTop + innerH - (tick / niceMax) * innerH; return <g key={tick}>
      <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="dhv2-chart-gridline" />
      <text x={padLeft - 8} y={y} className="dhv2-chart-axis-label" textAnchor="end" dominantBaseline="middle">{tick}</text>
    </g>; })}
    {values.map((v, i) => {
      const x = padLeft + slot * i + (slot - barWidth) / 2;
      const barHeight = (v / niceMax) * innerH;
      const y = padTop + innerH - barHeight;
      return <g key={i}>
        <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 2)} rx={6} className="dhv2-bar" />
        <text x={x + barWidth / 2} y={height - 4} className="dhv2-chart-axis-label" textAnchor="middle">{xLabels[i]}</text>
      </g>;
    })}
  </svg>;
}
