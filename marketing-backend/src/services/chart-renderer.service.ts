/* ============================================================
   Chart renderer for the V&V investor-deck pptx

   Hand-rolls SVG markup for the chart types we use in the deck
   (single + stacked column, line) and converts SVG to PNG via
   @resvg/resvg-js -- a Rust-based renderer that ships prebuilt
   binaries, so there's no native Cairo / canvas compile step.

   Theme: V&V navy background, gold/blue accent fills, white text.
   Output PNG sizes are pixel buffers that get embedded as
   ppt/media/chart-<placeholder>.png inside the pptx zip.
   ============================================================ */

import { Resvg } from '@resvg/resvg-js';

export interface ChartSeries {
  name: string;
  values: number[];
  /** Optional explicit fill colour. Defaults rotate through DEFAULT_COLORS. */
  color?: string;
}

export type ChartType = 'column' | 'stackedColumn' | 'line';

export interface ChartData {
  type:    ChartType;
  title?:  string;
  labels:  string[];
  series:  ChartSeries[];
  /** Format hint for the y-axis / value-formatter. */
  valueFormat?: 'currency' | 'percent' | 'count' | 'number';
}

const NAVY     = '#0A1628';
const NAVY_GRID= '#1f2c4a';
const GOLD     = '#E7CC59';
const BLUE     = '#3D6FCE';
const ACCENT2  = '#5b8de0';
const WHITE    = '#FFFFFF';
const GRAY     = '#9AA9BF';
const LGRAY    = '#C8D0E0';

const DEFAULT_COLORS = [BLUE, GOLD, ACCENT2, '#7A8FA8'];

/* ─── value formatting ─────────────────────────────────────────────────── */

function fmtValue(v: number, kind: ChartData['valueFormat']): string {
  if (!Number.isFinite(v)) return '';
  switch (kind) {
    case 'currency':
      if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
      if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
      return `$${v.toFixed(0)}`;
    case 'percent':
      return `${v.toFixed(v % 1 === 0 ? 0 : 1)}%`;
    case 'count':
      return v.toLocaleString('en-US');
    case 'number':
    default:
      if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
      if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ─── SVG builders ─────────────────────────────────────────────────────── */

interface Layout {
  w: number; h: number;
  pad: { top: number; right: number; bottom: number; left: number };
  innerW: number; innerH: number;
}

/**
 * Font/padding sizes scale with the canvas so charts look proportionally
 * dense whether they're 800px wide or 3000px wide. PowerPoint then
 * downscales to whatever the placeholder's actual rendered size is.
 */
interface Scale { titleFs: number; axisFs: number; legendFs: number; barLabelFs: number }
function scaleFor(w: number, h: number): Scale {
  // base on the geometric mean so very-wide-thin charts don't get giant text.
  const base = Math.sqrt(w * h);
  return {
    titleFs:    Math.max(20, Math.round(base * 0.030)),
    axisFs:     Math.max(16, Math.round(base * 0.022)),
    legendFs:   Math.max(16, Math.round(base * 0.022)),
    barLabelFs: Math.max(16, Math.round(base * 0.022)),
  };
}

function buildLayout(w: number, h: number, hasTitle: boolean, hasLegend: boolean): Layout {
  const s = scaleFor(w, h);
  const pad = {
    top:    hasTitle  ? Math.round(s.titleFs * 2.0) : Math.round(s.titleFs * 0.6),
    right:  Math.round(s.axisFs  * 1.5),
    bottom: hasLegend ? Math.round(s.legendFs * 3.5) : Math.round(s.legendFs * 2.4),
    left:   Math.round(s.axisFs  * 4.8),
  };
  return { w, h, pad, innerW: w - pad.left - pad.right, innerH: h - pad.top - pad.bottom };
}

function svgHeader(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
         `<rect width="${w}" height="${h}" fill="${NAVY}"/>`;
}

function svgTitle(title: string, w: number, s: Scale): string {
  return `<text x="${w / 2}" y="${Math.round(s.titleFs * 1.4)}" text-anchor="middle" fill="${WHITE}" ` +
         `font-family="Calibri,Arial,sans-serif" font-size="${s.titleFs}" font-weight="700">${escXml(title)}</text>`;
}

function svgAxes(layout: Layout, maxVal: number, vf: ChartData['valueFormat'], s: Scale): string {
  const { pad, innerW, innerH } = layout;
  const ticks = 4;
  let out = '';
  for (let i = 0; i <= ticks; i++) {
    const y = pad.top + innerH - (i * innerH) / ticks;
    out += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + innerW}" y2="${y}" stroke="${NAVY_GRID}" stroke-width="${Math.max(1, Math.round(s.axisFs / 14))}"/>`;
    out += `<text x="${pad.left - Math.round(s.axisFs * 0.6)}" y="${y + Math.round(s.axisFs * 0.35)}" text-anchor="end" fill="${GRAY}" font-family="Calibri,Arial,sans-serif" font-size="${s.axisFs}">${escXml(fmtValue((maxVal * i) / ticks, vf))}</text>`;
  }
  return out;
}

function svgLegend(series: ChartSeries[], colors: string[], layout: Layout, s: Scale): string {
  let out = '';
  let x = layout.pad.left;
  const y = layout.h - Math.round(s.legendFs * 1.2);
  const swatchW = Math.round(s.legendFs * 1.3);
  const swatchH = Math.round(s.legendFs * 0.95);
  for (let i = 0; i < series.length; i++) {
    out += `<rect x="${x}" y="${y - swatchH}" width="${swatchW}" height="${swatchH}" fill="${colors[i]}"/>`;
    out += `<text x="${x + swatchW + Math.round(s.legendFs * 0.4)}" y="${y - Math.round(s.legendFs * 0.1)}" fill="${LGRAY}" font-family="Calibri,Arial,sans-serif" font-size="${s.legendFs}">${escXml(series[i].name)}</text>`;
    x += swatchW + Math.round(s.legendFs * 0.4) + series[i].name.length * Math.round(s.legendFs * 0.55) + Math.round(s.legendFs * 1.4);
  }
  return out;
}

function buildColumnSvg(data: ChartData, w: number, h: number, stacked: boolean): string {
  const hasTitle  = !!(data.title && data.title.trim());
  const hasLegend = data.series.length > 1;
  const layout    = buildLayout(w, h, hasTitle, hasLegend);
  const s         = scaleFor(w, h);
  const colors    = data.series.map((sr, i) => sr.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]);

  // Compute max for y-axis scaling
  let maxVal = 0;
  if (stacked) {
    for (let i = 0; i < data.labels.length; i++) {
      let stack = 0;
      for (const sr of data.series) stack += sr.values[i] || 0;
      if (stack > maxVal) maxVal = stack;
    }
  } else {
    for (const sr of data.series) for (const v of sr.values) if (v > maxVal) maxVal = v;
  }
  if (maxVal === 0) maxVal = 1;

  const groupCount = data.labels.length;
  const groupW     = layout.innerW / Math.max(1, groupCount);
  const groupPad   = groupW * 0.18;
  const barW       = stacked ? groupW - groupPad : (groupW - groupPad) / data.series.length;

  let out = svgHeader(w, h);
  if (hasTitle) out += svgTitle(data.title!, w, s);
  out += svgAxes(layout, maxVal, data.valueFormat, s);

  for (let i = 0; i < groupCount; i++) {
    const groupX = layout.pad.left + i * groupW + groupPad / 2;

    if (stacked) {
      let stackY = layout.pad.top + layout.innerH;
      for (let si = 0; si < data.series.length; si++) {
        const v = data.series[si].values[i] || 0;
        if (v <= 0) continue;
        const barH = (v / maxVal) * layout.innerH;
        stackY -= barH;
        out += `<rect x="${groupX}" y="${stackY}" width="${Math.max(0, barW - 1)}" height="${Math.max(0, barH)}" fill="${colors[si]}"/>`;
      }
    } else {
      for (let si = 0; si < data.series.length; si++) {
        const v = data.series[si].values[i] || 0;
        const barH = (v / maxVal) * layout.innerH;
        const x = groupX + si * barW;
        const y = layout.pad.top + layout.innerH - Math.max(0, barH);
        out += `<rect x="${x}" y="${y}" width="${Math.max(0, barW - 2)}" height="${Math.max(0, barH)}" fill="${colors[si]}"/>`;
      }
    }

    const labelX = groupX + (stacked ? barW / 2 : (data.series.length * barW) / 2);
    const labelY = layout.pad.top + layout.innerH + Math.round(s.barLabelFs * 1.4);
    out += `<text x="${labelX}" y="${labelY}" text-anchor="middle" fill="${LGRAY}" font-family="Calibri,Arial,sans-serif" font-size="${s.barLabelFs}">${escXml(data.labels[i])}</text>`;
  }

  if (hasLegend) out += svgLegend(data.series, colors, layout, s);
  out += '</svg>';
  return out;
}

function buildLineSvg(data: ChartData, w: number, h: number): string {
  const hasTitle  = !!(data.title && data.title.trim());
  const hasLegend = data.series.length > 1;
  const layout    = buildLayout(w, h, hasTitle, hasLegend);
  const s         = scaleFor(w, h);
  const colors    = data.series.map((sr, i) => sr.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]);

  let maxVal = 0;
  for (const sr of data.series) for (const v of sr.values) if (v > maxVal) maxVal = v;
  if (maxVal === 0) maxVal = 1;

  const stepX = layout.innerW / Math.max(1, data.labels.length - 1);
  const strokeW = Math.max(2.5, Math.round(s.axisFs / 5));
  const dotR    = Math.max(3.5, Math.round(s.axisFs / 4));

  let out = svgHeader(w, h);
  if (hasTitle) out += svgTitle(data.title!, w, s);
  out += svgAxes(layout, maxVal, data.valueFormat, s);

  for (let si = 0; si < data.series.length; si++) {
    const series = data.series[si];
    const pts: string[] = [];
    for (let i = 0; i < data.labels.length; i++) {
      const v = series.values[i] || 0;
      const x = layout.pad.left + i * stepX;
      const y = layout.pad.top + layout.innerH - (v / maxVal) * layout.innerH;
      pts.push(`${x},${y}`);
    }
    out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[si]}" stroke-width="${strokeW}"/>`;
    for (const p of pts) {
      const [x, y] = p.split(',');
      out += `<circle cx="${x}" cy="${y}" r="${dotR}" fill="${colors[si]}"/>`;
    }
  }

  for (let i = 0; i < data.labels.length; i++) {
    const x = layout.pad.left + i * stepX;
    out += `<text x="${x}" y="${layout.pad.top + layout.innerH + Math.round(s.barLabelFs * 1.4)}" text-anchor="middle" fill="${LGRAY}" font-family="Calibri,Arial,sans-serif" font-size="${s.barLabelFs}">${escXml(data.labels[i])}</text>`;
  }

  if (hasLegend) out += svgLegend(data.series, colors, layout, s);
  out += '</svg>';
  return out;
}

/* ─── Public API ─────────────────────────────────────────────────────── */

/**
 * Render a chart to a PNG buffer at the requested pixel dimensions. The
 * pptx embeds raw PNG bytes, no compression-step needed -- resvg produces
 * tight output for small charts (typically 20-60 KB).
 */
export function renderChartPng(data: ChartData, widthPx = 1600, heightPx = 1000): Buffer {
  let svg: string;
  switch (data.type) {
    case 'column':         svg = buildColumnSvg(data, widthPx, heightPx, false); break;
    case 'stackedColumn':  svg = buildColumnSvg(data, widthPx, heightPx, true);  break;
    case 'line':           svg = buildLineSvg(data, widthPx, heightPx);          break;
    default:
      throw new Error(`Unsupported chart type: ${data.type}`);
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: widthPx },
    background: NAVY,
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * Validate that an unknown value (typically from Claude's extractor JSON)
 * conforms to ChartData shape. Returns null if invalid.
 */
export function asChartData(v: unknown): ChartData | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const type = o.type as string | undefined;
  if (type !== 'column' && type !== 'stackedColumn' && type !== 'line') return null;
  const labels = Array.isArray(o.labels) ? (o.labels as unknown[]).map(String) : null;
  const series = Array.isArray(o.series) ? o.series as unknown[] : null;
  if (!labels || labels.length === 0 || !series || series.length === 0) return null;
  const cleanSeries: ChartSeries[] = [];
  for (const s of series) {
    if (!s || typeof s !== 'object') continue;
    const so = s as Record<string, unknown>;
    const name = typeof so.name === 'string' ? so.name : '';
    const values = Array.isArray(so.values)
      ? (so.values as unknown[]).map((x) => typeof x === 'number' ? x : Number(x) || 0)
      : null;
    if (!name || !values) continue;
    cleanSeries.push({
      name,
      values,
      color: typeof so.color === 'string' ? so.color : undefined,
    });
  }
  if (cleanSeries.length === 0) return null;
  return {
    type,
    title:       typeof o.title === 'string' ? o.title : undefined,
    labels,
    series:      cleanSeries,
    valueFormat: typeof o.valueFormat === 'string'
      ? (o.valueFormat as ChartData['valueFormat'])
      : undefined,
  };
}
