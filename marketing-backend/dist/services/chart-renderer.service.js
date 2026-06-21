"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderChartPng = renderChartPng;
exports.asChartData = asChartData;
const resvg_js_1 = require("@resvg/resvg-js");
const NAVY = '#0A1628';
const NAVY_GRID = '#1f2c4a';
const GOLD = '#E7CC59';
const BLUE = '#3D6FCE';
const ACCENT2 = '#5b8de0';
const WHITE = '#FFFFFF';
const GRAY = '#9AA9BF';
const LGRAY = '#C8D0E0';
const DEFAULT_COLORS = [BLUE, GOLD, ACCENT2, '#7A8FA8'];
/* ─── value formatting ─────────────────────────────────────────────────── */
function fmtValue(v, kind) {
    if (!Number.isFinite(v))
        return '';
    switch (kind) {
        case 'currency':
            if (Math.abs(v) >= 1000000)
                return `$${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`;
            if (Math.abs(v) >= 1000)
                return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
            return `$${v.toFixed(0)}`;
        case 'percent':
            return `${v.toFixed(v % 1 === 0 ? 0 : 1)}%`;
        case 'count':
            return v.toLocaleString('en-US');
        case 'number':
        default:
            if (Math.abs(v) >= 1000000)
                return `${(v / 1000000).toFixed(1)}M`;
            if (Math.abs(v) >= 1000)
                return `${(v / 1000).toFixed(1)}K`;
            return Number.isInteger(v) ? String(v) : v.toFixed(1);
    }
}
function escXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function scaleFor(w, h) {
    // base on the geometric mean so very-wide-thin charts don't get giant text.
    const base = Math.sqrt(w * h);
    return {
        titleFs: Math.max(20, Math.round(base * 0.030)),
        axisFs: Math.max(16, Math.round(base * 0.022)),
        legendFs: Math.max(16, Math.round(base * 0.022)),
        barLabelFs: Math.max(16, Math.round(base * 0.022)),
    };
}
function buildLayout(w, h, hasTitle, hasLegend) {
    const s = scaleFor(w, h);
    // Extra top headroom equal to ~1.4x the value-label font so max-height bars
    // can carry a value label without colliding with the title.
    const valueLabelRoom = Math.round(s.barLabelFs * 1.4);
    const pad = {
        top: (hasTitle ? Math.round(s.titleFs * 2.0) : Math.round(s.titleFs * 0.6)) + valueLabelRoom,
        right: Math.round(s.axisFs * 1.5),
        bottom: hasLegend ? Math.round(s.legendFs * 3.5) : Math.round(s.legendFs * 2.4),
        left: Math.round(s.axisFs * 4.8),
    };
    return { w, h, pad, innerW: w - pad.left - pad.right, innerH: h - pad.top - pad.bottom };
}
function svgHeader(w, h) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<rect width="${w}" height="${h}" fill="${NAVY}"/>`;
}
function svgTitle(title, w, s) {
    return `<text x="${w / 2}" y="${Math.round(s.titleFs * 1.4)}" text-anchor="middle" fill="${WHITE}" ` +
        `font-family="Calibri,Arial,sans-serif" font-size="${s.titleFs}" font-weight="700">${escXml(title)}</text>`;
}
function svgAxes(layout, maxVal, vf, s) {
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
function svgLegend(series, colors, layout, s) {
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
function buildColumnSvg(data, w, h, stacked) {
    const hasTitle = !!(data.title && data.title.trim());
    const hasLegend = data.series.length > 1;
    const layout = buildLayout(w, h, hasTitle, hasLegend);
    const s = scaleFor(w, h);
    const colors = data.series.map((sr, i) => sr.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
    // Compute max for y-axis scaling
    let maxVal = 0;
    if (stacked) {
        for (let i = 0; i < data.labels.length; i++) {
            let stack = 0;
            for (const sr of data.series)
                stack += sr.values[i] || 0;
            if (stack > maxVal)
                maxVal = stack;
        }
    }
    else {
        for (const sr of data.series)
            for (const v of sr.values)
                if (v > maxVal)
                    maxVal = v;
    }
    if (maxVal === 0)
        maxVal = 1;
    const groupCount = data.labels.length;
    const groupW = layout.innerW / Math.max(1, groupCount);
    const groupPad = groupW * 0.18;
    const barW = stacked ? groupW - groupPad : (groupW - groupPad) / data.series.length;
    let out = svgHeader(w, h);
    if (hasTitle)
        out += svgTitle(data.title, w, s);
    out += svgAxes(layout, maxVal, data.valueFormat, s);
    for (let i = 0; i < groupCount; i++) {
        const groupX = layout.pad.left + i * groupW + groupPad / 2;
        const valuePad = Math.round(s.barLabelFs * 0.45); // gap between bar top and value label
        if (stacked) {
            // Draw stacked bars bottom-up, then the TOTAL value label above the stack.
            let stackY = layout.pad.top + layout.innerH;
            let total = 0;
            for (let si = 0; si < data.series.length; si++) {
                const v = data.series[si].values[i] || 0;
                if (v <= 0)
                    continue;
                const barH = (v / maxVal) * layout.innerH;
                stackY -= barH;
                total += v;
                out += `<rect x="${groupX}" y="${stackY}" width="${Math.max(0, barW - 1)}" height="${Math.max(0, barH)}" fill="${colors[si]}"/>`;
            }
            if (total > 0) {
                const txt = fmtValue(total, data.valueFormat);
                out += `<text x="${groupX + barW / 2}" y="${stackY - valuePad}" text-anchor="middle" fill="${WHITE}" font-family="Calibri,Arial,sans-serif" font-size="${s.barLabelFs}" font-weight="600">${escXml(txt)}</text>`;
            }
        }
        else {
            for (let si = 0; si < data.series.length; si++) {
                const v = data.series[si].values[i] || 0;
                const barH = (v / maxVal) * layout.innerH;
                const x = groupX + si * barW;
                const y = layout.pad.top + layout.innerH - Math.max(0, barH);
                out += `<rect x="${x}" y="${y}" width="${Math.max(0, barW - 2)}" height="${Math.max(0, barH)}" fill="${colors[si]}"/>`;
                // Value label above each bar.
                if (v !== 0) {
                    const txt = fmtValue(v, data.valueFormat);
                    out += `<text x="${x + (barW - 2) / 2}" y="${y - valuePad}" text-anchor="middle" fill="${WHITE}" font-family="Calibri,Arial,sans-serif" font-size="${s.barLabelFs}" font-weight="600">${escXml(txt)}</text>`;
                }
            }
        }
        const labelX = groupX + (stacked ? barW / 2 : (data.series.length * barW) / 2);
        const labelY = layout.pad.top + layout.innerH + Math.round(s.barLabelFs * 1.4);
        out += `<text x="${labelX}" y="${labelY}" text-anchor="middle" fill="${LGRAY}" font-family="Calibri,Arial,sans-serif" font-size="${s.barLabelFs}">${escXml(data.labels[i])}</text>`;
    }
    if (hasLegend)
        out += svgLegend(data.series, colors, layout, s);
    out += '</svg>';
    return out;
}
function buildLineSvg(data, w, h) {
    const hasTitle = !!(data.title && data.title.trim());
    const hasLegend = data.series.length > 1;
    const layout = buildLayout(w, h, hasTitle, hasLegend);
    const s = scaleFor(w, h);
    const colors = data.series.map((sr, i) => sr.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
    let maxVal = 0;
    for (const sr of data.series)
        for (const v of sr.values)
            if (v > maxVal)
                maxVal = v;
    if (maxVal === 0)
        maxVal = 1;
    const stepX = layout.innerW / Math.max(1, data.labels.length - 1);
    const strokeW = Math.max(2.5, Math.round(s.axisFs / 5));
    const dotR = Math.max(3.5, Math.round(s.axisFs / 4));
    let out = svgHeader(w, h);
    if (hasTitle)
        out += svgTitle(data.title, w, s);
    out += svgAxes(layout, maxVal, data.valueFormat, s);
    for (let si = 0; si < data.series.length; si++) {
        const series = data.series[si];
        const pts = [];
        for (let i = 0; i < data.labels.length; i++) {
            const v = series.values[i] || 0;
            const x = layout.pad.left + i * stepX;
            const y = layout.pad.top + layout.innerH - (v / maxVal) * layout.innerH;
            pts.push({ x, y, v });
        }
        out += `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${colors[si]}" stroke-width="${strokeW}"/>`;
        const labelOffset = Math.round(s.barLabelFs * 0.9) + dotR;
        for (const p of pts) {
            out += `<circle cx="${p.x}" cy="${p.y}" r="${dotR}" fill="${colors[si]}"/>`;
            if (p.v !== 0) {
                const txt = fmtValue(p.v, data.valueFormat);
                out += `<text x="${p.x}" y="${p.y - labelOffset}" text-anchor="middle" fill="${WHITE}" font-family="Calibri,Arial,sans-serif" font-size="${s.barLabelFs}" font-weight="600">${escXml(txt)}</text>`;
            }
        }
    }
    for (let i = 0; i < data.labels.length; i++) {
        const x = layout.pad.left + i * stepX;
        out += `<text x="${x}" y="${layout.pad.top + layout.innerH + Math.round(s.barLabelFs * 1.4)}" text-anchor="middle" fill="${LGRAY}" font-family="Calibri,Arial,sans-serif" font-size="${s.barLabelFs}">${escXml(data.labels[i])}</text>`;
    }
    if (hasLegend)
        out += svgLegend(data.series, colors, layout, s);
    out += '</svg>';
    return out;
}
/* ─── Public API ─────────────────────────────────────────────────────── */
/**
 * Render a chart to a PNG buffer at the requested pixel dimensions. The
 * pptx embeds raw PNG bytes, no compression-step needed -- resvg produces
 * tight output for small charts (typically 20-60 KB).
 */
function renderChartPng(data, widthPx = 1600, heightPx = 1000) {
    let svg;
    switch (data.type) {
        case 'column':
            svg = buildColumnSvg(data, widthPx, heightPx, false);
            break;
        case 'stackedColumn':
            svg = buildColumnSvg(data, widthPx, heightPx, true);
            break;
        case 'line':
            svg = buildLineSvg(data, widthPx, heightPx);
            break;
        default:
            throw new Error(`Unsupported chart type: ${data.type}`);
    }
    const resvg = new resvg_js_1.Resvg(svg, {
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
function asChartData(v) {
    if (!v || typeof v !== 'object')
        return null;
    const o = v;
    const type = o.type;
    if (type !== 'column' && type !== 'stackedColumn' && type !== 'line')
        return null;
    const labels = Array.isArray(o.labels) ? o.labels.map(String) : null;
    const series = Array.isArray(o.series) ? o.series : null;
    if (!labels || labels.length === 0 || !series || series.length === 0)
        return null;
    const cleanSeries = [];
    for (const s of series) {
        if (!s || typeof s !== 'object')
            continue;
        const so = s;
        const name = typeof so.name === 'string' ? so.name : '';
        const values = Array.isArray(so.values)
            ? so.values.map((x) => typeof x === 'number' ? x : Number(x) || 0)
            : null;
        if (!name || !values)
            continue;
        cleanSeries.push({
            name,
            values,
            color: typeof so.color === 'string' ? so.color : undefined,
        });
    }
    if (cleanSeries.length === 0)
        return null;
    return {
        type,
        title: typeof o.title === 'string' ? o.title : undefined,
        labels,
        series: cleanSeries,
        valueFormat: typeof o.valueFormat === 'string'
            ? o.valueFormat
            : undefined,
    };
}
