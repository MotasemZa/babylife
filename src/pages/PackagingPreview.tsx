import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import inbewLogo from '@/assets/brand/inbew-logo.png';

/**
 * Hidden route: /packaging-preview
 * Production dieline for the Universal Stylus Pen — inbew branded.
 * Dimensions locked to the supplier PDF (2260刀模图.pdf):
 *   Panels L→R: 15.5 / 51.5 / 16.0 / 51.5 / 15.5 mm  ·  height 202 mm  ·  dust flaps ~28 mm
 */

// --- true dieline geometry (mm) ---
const P = {
  glueL: 15.5,
  front: 51.5,
  sideA: 16.0,
  back: 51.5,
  glueR: 15.5,
  height: 202,
  dust: 28,      // top/bottom dust flap depth
  tuck: 14,      // inner tuck flap depth
};
const SHEET_W = P.glueL + P.front + P.sideA + P.back + P.glueR; // 150
const SHEET_H = P.height + P.dust + P.tuck;                     // 244

// panel x-origins in mm
const X = {
  glueL: 0,
  front: P.glueL,
  sideA: P.glueL + P.front,
  back: P.glueL + P.front + P.sideA,
  glueR: P.glueL + P.front + P.sideA + P.back,
};
const Y = { top: 0, body: P.dust, bottom: P.dust + P.height };

// mm → px scale (screen preview)
const S = 3.2;
const mm = (v: number) => v * S;

type Direction = 'editorial' | 'tech';

const PackagingPreview = () => {
  const [dir, setDir] = useState<Direction>('editorial');

  return (
    <div className="min-h-screen bg-neutral-100 py-10 px-4">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
              Universal Stylus Pen · Packaging Dieline
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              For supplier · true scale {SHEET_W} × {SHEET_H} mm · panels {P.front}×{P.height} mm
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={dir} onValueChange={(v) => setDir(v as Direction)}>
              <TabsList>
                <TabsTrigger value="editorial">Editorial</TabsTrigger>
                <TabsTrigger value="tech">Precision Tech</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Export
            </Button>
          </div>
        </header>

        <div className="rounded-xl bg-white shadow-lg p-8 overflow-x-auto">
          <div className="mx-auto" style={{ width: mm(SHEET_W) }}>
            <Dimensions />
            <div className="mt-3">
              {dir === 'editorial' ? <EditorialDieline /> : <TechDieline />}
            </div>
            <Legend />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <MockupCard title="Front — assembled" panel="front" direction={dir} />
          <MockupCard title="Back — assembled" panel="back" direction={dir} />
        </div>

        <p className="text-center text-xs text-neutral-400">
          Hidden preview · dimensions locked to supplier PDF · not linked in navigation
        </p>
      </div>
    </div>
  );
};

/* ---------- shared dieline scaffold (cut/fold lines) ---------- */

const CUT = '#e11d74';
const FOLD = '#94a3b8';

const DielineFrame = ({ children }: { children: React.ReactNode }) => (
  <svg
    width={mm(SHEET_W)}
    height={mm(SHEET_H)}
    viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
    style={{ display: 'block' }}
  >
    <defs>
      <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
        <path d="M5 0H0V5" fill="none" stroke="#f1f5f9" strokeWidth="0.1" />
      </pattern>
    </defs>
    <rect width={SHEET_W} height={SHEET_H} fill="url(#grid)" />

    {/* Panel content (art) */}
    {children}

    {/* Cut outline (main body + flaps) */}
    <g fill="none" stroke={CUT} strokeWidth="0.3">
      {/* main body outer */}
      <rect x={0} y={Y.body} width={SHEET_W} height={P.height} />
      {/* top dust flaps: over front & back panels only */}
      <path
        d={`M ${X.front} ${Y.body} L ${X.front + 4} ${Y.top}
            L ${X.front + P.front - 4} ${Y.top}
            L ${X.sideA} ${Y.body}`}
      />
      <path
        d={`M ${X.back} ${Y.body} L ${X.back + 4} ${Y.top}
            L ${X.back + P.back - 4} ${Y.top}
            L ${X.glueR} ${Y.body}`}
      />
      {/* bottom tuck flaps */}
      <path
        d={`M ${X.front} ${Y.bottom} L ${X.front + 3} ${Y.bottom + P.tuck}
            L ${X.front + P.front - 3} ${Y.bottom + P.tuck}
            L ${X.sideA} ${Y.bottom}`}
      />
      <path
        d={`M ${X.back} ${Y.bottom} L ${X.back + 3} ${Y.bottom + P.tuck}
            L ${X.back + P.back - 3} ${Y.bottom + P.tuck}
            L ${X.glueR} ${Y.bottom}`}
      />
      {/* side dust triangles */}
      <path d={`M ${X.sideA} ${Y.body} L ${X.sideA + P.sideA / 2} ${Y.body - 6} L ${X.back} ${Y.body}`} />
      <path d={`M ${X.sideA} ${Y.bottom} L ${X.sideA + P.sideA / 2} ${Y.bottom + 6} L ${X.back} ${Y.bottom}`} />
      <path d={`M 0 ${Y.body} L ${-3} ${Y.body + 6} L ${-3} ${Y.bottom - 6} L 0 ${Y.bottom}`} />
      <path d={`M ${SHEET_W} ${Y.body} L ${SHEET_W + 3} ${Y.body + 6} L ${SHEET_W + 3} ${Y.bottom - 6} L ${SHEET_W} ${Y.bottom}`} />
    </g>

    {/* Fold lines (dashed) */}
    <g fill="none" stroke={FOLD} strokeWidth="0.25" strokeDasharray="1.2 0.9">
      <line x1={X.front} y1={Y.body} x2={X.front} y2={Y.bottom} />
      <line x1={X.sideA} y1={Y.body} x2={X.sideA} y2={Y.bottom} />
      <line x1={X.back} y1={Y.body} x2={X.back} y2={Y.bottom} />
      <line x1={X.glueR} y1={Y.body} x2={X.glueR} y2={Y.bottom} />
      <line x1={0} y1={Y.body} x2={SHEET_W} y2={Y.body} />
      <line x1={0} y1={Y.bottom} x2={SHEET_W} y2={Y.bottom} />
    </g>
  </svg>
);

/* ---------- Direction A · Editorial ---------- */

const INK = '#0b0b0d';
const CREAM = '#f5f2ec';
const ACCENT = '#c8a25b'; // warm brass

const EditorialDieline = () => (
  <DielineFrame>
    {/* --- GLUE FLAP L (blank cream) --- */}
    <rect x={X.glueL} y={Y.body} width={P.glueL} height={P.height} fill={CREAM} opacity="0.4" />

    {/* --- FRONT PANEL --- */}
    <g>
      <rect x={X.front} y={Y.body} width={P.front} height={P.height} fill={CREAM} />
      {/* thin brass frame */}
      <rect
        x={X.front + 2}
        y={Y.body + 2}
        width={P.front - 4}
        height={P.height - 4}
        fill="none"
        stroke={ACCENT}
        strokeWidth="0.2"
      />
      {/* top wordmark */}
      <text x={X.front + P.front / 2} y={Y.body + 12} textAnchor="middle"
        fontFamily="Georgia, serif" fontSize="4" fill={INK} letterSpacing="0.4">
        inbew
      </text>
      <line x1={X.front + P.front / 2 - 8} y1={Y.body + 14} x2={X.front + P.front / 2 + 8} y2={Y.body + 14}
        stroke={ACCENT} strokeWidth="0.2" />
      <text x={X.front + P.front / 2} y={Y.body + 18} textAnchor="middle"
        fontFamily="Georgia, serif" fontSize="1.6" fill={INK} letterSpacing="1.2" fontStyle="italic">
        precision instruments
      </text>

      {/* central product silhouette (vertical stylus) */}
      <g transform={`translate(${X.front + P.front / 2}, ${Y.body + P.height / 2})`}>
        <line x1="0" y1="-55" x2="0" y2="55" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
        {/* tip */}
        <polygon points="-1.6,55 1.6,55 0,62" fill={INK} />
        {/* charging port */}
        <circle cx="0" cy="-48" r="0.9" fill={ACCENT} />
        {/* battery dots */}
        <circle cx="0" cy="-42" r="0.4" fill={ACCENT} />
        <circle cx="0" cy="-40" r="0.4" fill={ACCENT} />
        <circle cx="0" cy="-38" r="0.4" fill={ACCENT} />
        <circle cx="0" cy="-36" r="0.4" fill={ACCENT} />
      </g>

      {/* bottom title block */}
      <text x={X.front + P.front / 2} y={Y.body + P.height - 22} textAnchor="middle"
        fontFamily="Georgia, serif" fontSize="3.6" fill={INK}>
        Universal
      </text>
      <text x={X.front + P.front / 2} y={Y.body + P.height - 17} textAnchor="middle"
        fontFamily="Georgia, serif" fontSize="3.6" fill={INK} fontStyle="italic">
        Stylus Pen
      </text>
      <line x1={X.front + 8} y1={Y.body + P.height - 13} x2={X.front + P.front - 8} y2={Y.body + P.height - 13}
        stroke={ACCENT} strokeWidth="0.15" />
      <text x={X.front + P.front / 2} y={Y.body + P.height - 8} textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif" fontSize="1.6" fill="#555" letterSpacing="0.8">
        MODEL · ST-01
      </text>
      <text x={X.front + P.front / 2} y={Y.body + P.height - 5} textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif" fontSize="1.4" fill="#888" letterSpacing="1.5">
        iOS · ANDROID · WINDOWS
      </text>
    </g>

    {/* --- SIDE A (spine) --- */}
    <g>
      <rect x={X.sideA} y={Y.body} width={P.sideA} height={P.height} fill={INK} />
      <text
        transform={`translate(${X.sideA + P.sideA / 2}, ${Y.body + P.height / 2}) rotate(-90)`}
        textAnchor="middle" fontFamily="Georgia, serif" fontSize="3.4" fill={CREAM} letterSpacing="1.5"
      >
        inbew  ·  Universal Stylus Pen  ·  ST-01
      </text>
    </g>

    {/* --- BACK PANEL --- */}
    <g>
      <rect x={X.back} y={Y.body} width={P.back} height={P.height} fill={CREAM} />
      <rect x={X.back + 2} y={Y.body + 2} width={P.back - 4} height={P.height - 4}
        fill="none" stroke={ACCENT} strokeWidth="0.2" />

      <text x={X.back + P.back / 2} y={Y.body + 10} textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif" fontSize="1.6" fill="#555" letterSpacing="2">
        FEATURES
      </text>
      <line x1={X.back + P.back / 2 - 4} y1={Y.body + 12} x2={X.back + P.back / 2 + 4} y2={Y.body + 12}
        stroke={ACCENT} strokeWidth="0.2" />

      {[
        { t: '01', l: 'Magnetic', s: 'Attaches to iPad edge' },
        { t: '02', l: 'Writes smoothly', s: 'Palm rejection · tilt' },
        { t: '03', l: 'USB Type-C', s: 'Fast, universal charging' },
        { t: '04', l: 'Long battery', s: '10h use · 30d standby' },
      ].map((f, i) => (
        <g key={f.t} transform={`translate(${X.back + 6}, ${Y.body + 22 + i * 20})`}>
          <text fontFamily="Georgia, serif" fontStyle="italic" fontSize="4" fill={ACCENT}>{f.t}</text>
          <text x={12} fontFamily="Georgia, serif" fontSize="3" fill={INK}>{f.l}</text>
          <text x={12} y={4} fontFamily="Helvetica, Arial, sans-serif" fontSize="1.8" fill="#666">{f.s}</text>
          <line x1={0} y1={7} x2={P.back - 12} y2={7} stroke={ACCENT} strokeWidth="0.1" opacity="0.5" />
        </g>
      ))}

      {/* compatibility */}
      <text x={X.back + 6} y={Y.body + 118} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill="#555" letterSpacing="1.5">COMPATIBILITY</text>
      <text x={X.back + 6} y={Y.body + 123} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.7" fill={INK}>iPad Air (4th gen)</text>
      <text x={X.back + 6} y={Y.body + 127} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.7" fill={INK}>iPad Pro 11" (1st / 2nd / 3rd)</text>
      <text x={X.back + 6} y={Y.body + 131} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.7" fill={INK}>iPad Pro 12.9" (3rd / 4th / 5th)</text>

      {/* what's in box */}
      <text x={X.back + 6} y={Y.body + 145} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill="#555" letterSpacing="1.5">IN THE BOX</text>
      <text x={X.back + 6} y={Y.body + 150} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.7" fill={INK}>1× Stylus · 1× USB-C cable · 2× Tips · Manual</text>

      {/* certs + barcode area */}
      <g transform={`translate(${X.back + 6}, ${Y.body + P.height - 24})`}>
        {['FC', 'CE', 'RoHS'].map((c, i) => (
          <g key={c} transform={`translate(${i * 9}, 0)`}>
            <rect width="7" height="4" fill="none" stroke={INK} strokeWidth="0.2" />
            <text x="3.5" y="3" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif"
              fontSize="1.7" fill={INK}>{c}</text>
          </g>
        ))}
      </g>
      <g transform={`translate(${X.back + P.back - 22}, ${Y.body + P.height - 22})`}>
        {/* barcode */}
        {Array.from({ length: 22 }).map((_, i) => (
          <rect key={i} x={i * 0.7} y={0} width={i % 3 === 0 ? 0.35 : 0.2} height={8} fill={INK} />
        ))}
        <text y={11} fontFamily="Helvetica, Arial, sans-serif" fontSize="1.4" fill={INK}>
          6 971234 500018
        </text>
      </g>
      <text x={X.back + P.back / 2} y={Y.body + P.height - 4} textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif" fontSize="1.4" fill="#888" letterSpacing="1.5">
        DESIGNED BY INBEW · MADE IN CHINA
      </text>
    </g>

    {/* --- GLUE FLAP R --- */}
    <rect x={X.glueR} y={Y.body} width={P.glueR} height={P.height} fill={CREAM} opacity="0.4" />

    {/* top/bottom flaps — cream tone */}
    <rect x={X.front + 4} y={Y.top + 0.3} width={P.front - 8} height={P.dust - 0.3} fill={CREAM} opacity="0.6" />
    <rect x={X.back + 4} y={Y.top + 0.3} width={P.back - 8} height={P.dust - 0.3} fill={CREAM} opacity="0.6" />
    <rect x={X.front + 3} y={Y.bottom} width={P.front - 6} height={P.tuck - 0.3} fill={CREAM} opacity="0.6" />
    <rect x={X.back + 3} y={Y.bottom} width={P.back - 6} height={P.tuck - 0.3} fill={CREAM} opacity="0.6" />
  </DielineFrame>
);

/* ---------- Direction B · Precision Tech ---------- */

const TECH_INK = '#0a0e1a';
const TECH_ACCENT = '#00d4a8';
const TECH_MUTE = '#1a2033';

const TechDieline = () => (
  <DielineFrame>
    <rect x={X.glueL} y={Y.body} width={P.glueL} height={P.height} fill={TECH_INK} opacity="0.5" />

    {/* FRONT */}
    <g>
      <rect x={X.front} y={Y.body} width={P.front} height={P.height} fill={TECH_INK} />
      {/* corner brackets */}
      {[
        [X.front + 3, Y.body + 3, 0],
        [X.front + P.front - 3, Y.body + 3, 90],
        [X.front + P.front - 3, Y.body + P.height - 3, 180],
        [X.front + 3, Y.body + P.height - 3, 270],
      ].map(([cx, cy, r], i) => (
        <g key={i} transform={`translate(${cx}, ${cy}) rotate(${r})`}>
          <path d="M0 0 h4 M0 0 v4" stroke={TECH_ACCENT} strokeWidth="0.3" fill="none" />
        </g>
      ))}

      {/* header */}
      <text x={X.front + 4} y={Y.body + 10} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill={TECH_ACCENT} letterSpacing="2">INBEW / ST-01</text>
      <text x={X.front + P.front - 4} y={Y.body + 10} textAnchor="end"
        fontFamily="Helvetica, Arial, sans-serif" fontSize="1.4" fill="#7a8399" letterSpacing="1.5">
        REV.24
      </text>

      {/* isometric stylus */}
      <g transform={`translate(${X.front + P.front / 2}, ${Y.body + 60})`}>
        <line x1="0" y1="-25" x2="0" y2="55" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
        <line x1="-0.6" y1="-25" x2="-0.6" y2="55" stroke={TECH_ACCENT} strokeWidth="0.4" opacity="0.4" />
        <polygon points="-1.8,55 1.8,55 0,63" fill="#ffffff" />
        {/* type-c */}
        <rect x="-1.2" y="-24" width="2.4" height="0.6" rx="0.3" fill={TECH_ACCENT} />
        {/* level dots */}
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx="0" cy={-19 + i * 2} r="0.4" fill={TECH_ACCENT} />
        ))}
      </g>

      {/* callouts */}
      <g fontFamily="Helvetica, Arial, sans-serif" fontSize="1.5" fill="#a8b1c7">
        <line x1={X.front + P.front / 2 + 2} y1={Y.body + 36} x2={X.front + P.front - 6} y2={Y.body + 30}
          stroke={TECH_ACCENT} strokeWidth="0.15" />
        <text x={X.front + P.front - 6} y={Y.body + 29} textAnchor="end">USB-C</text>

        <line x1={X.front + P.front / 2 + 2} y1={Y.body + 45} x2={X.front + P.front - 6} y2={Y.body + 50}
          stroke={TECH_ACCENT} strokeWidth="0.15" />
        <text x={X.front + P.front - 6} y={Y.body + 49} textAnchor="end">LED × 4</text>

        <line x1={X.front + P.front / 2 - 2} y1={Y.body + 115} x2={X.front + 6} y2={Y.body + 120}
          stroke={TECH_ACCENT} strokeWidth="0.15" />
        <text x={X.front + 6} y={Y.body + 119}>1.0 mm TIP</text>
      </g>

      {/* main title */}
      <text x={X.front + 4} y={Y.body + P.height - 30} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="5.5" fontWeight="700" fill="#ffffff" letterSpacing="-0.2">STYLUS</text>
      <text x={X.front + 4} y={Y.body + P.height - 24} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="5.5" fontWeight="300" fill="#ffffff" letterSpacing="-0.2">PEN 01</text>
      <line x1={X.front + 4} y1={Y.body + P.height - 20} x2={X.front + P.front - 4} y2={Y.body + P.height - 20}
        stroke={TECH_ACCENT} strokeWidth="0.2" />
      <text x={X.front + 4} y={Y.body + P.height - 15} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill="#a8b1c7" letterSpacing="1">
        MAGNETIC · TILT · PALM REJECTION
      </text>
      <text x={X.front + 4} y={Y.body + P.height - 10} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.4" fill="#7a8399" letterSpacing="1.5">
        FOR iOS · ANDROID · WINDOWS
      </text>
      <g transform={`translate(${X.front + P.front - 12}, ${Y.body + P.height - 12})`}>
        <circle r="4" fill="none" stroke={TECH_ACCENT} strokeWidth="0.3" />
        <text textAnchor="middle" y="0.8" fontFamily="Helvetica, Arial, sans-serif"
          fontSize="2.4" fill={TECH_ACCENT} fontWeight="700">01</text>
      </g>
    </g>

    {/* SPINE */}
    <g>
      <rect x={X.sideA} y={Y.body} width={P.sideA} height={P.height} fill={TECH_MUTE} />
      <text
        transform={`translate(${X.sideA + P.sideA / 2}, ${Y.body + P.height / 2}) rotate(-90)`}
        textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif"
        fontSize="3" fill="#ffffff" letterSpacing="2.5" fontWeight="700"
      >
        INBEW / STYLUS PEN 01 / ST-01
      </text>
    </g>

    {/* BACK */}
    <g>
      <rect x={X.back} y={Y.body} width={P.back} height={P.height} fill={TECH_INK} />

      <text x={X.back + 4} y={Y.body + 10} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill={TECH_ACCENT} letterSpacing="2">SPECIFICATIONS</text>
      <line x1={X.back + 4} y1={Y.body + 12} x2={X.back + P.back - 4} y2={Y.body + 12}
        stroke={TECH_ACCENT} strokeWidth="0.15" opacity="0.5" />

      {[
        ['MODEL', 'ST-01'],
        ['TIP', '1.0 mm POM · replaceable'],
        ['BATTERY', '140 mAh Li-ion'],
        ['USE TIME', '10 h continuous'],
        ['STANDBY', '30 days'],
        ['CHARGING', 'USB Type-C · 45 min'],
        ['WEIGHT', '14 g'],
        ['LENGTH', '166 mm'],
      ].map(([k, v], i) => (
        <g key={k} transform={`translate(${X.back + 4}, ${Y.body + 20 + i * 6})`}>
          <text fontFamily="Helvetica, Arial, sans-serif" fontSize="1.5"
            fill="#7a8399" letterSpacing="1">{k}</text>
          <text x={P.back - 8} textAnchor="end" fontFamily="Helvetica, Arial, sans-serif"
            fontSize="1.9" fill="#ffffff">{v}</text>
          <line x1={0} y1={2} x2={P.back - 8} y2={2} stroke="#2a3149" strokeWidth="0.1" />
        </g>
      ))}

      {/* feature icons grid */}
      <g transform={`translate(${X.back + 4}, ${Y.body + 82})`}>
        {[
          { l: 'MAGNET', d: 'M0 0h4v3h-1v-2h-2v2h-1z' },
          { l: 'USB-C', d: 'M0 1.5a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1 -1.5 1.5h-1a1.5 1.5 0 0 1 -1.5 -1.5z' },
          { l: 'SMOOTH', d: 'M0 3l4-3M2 3l2-1' },
          { l: 'BATTERY', d: 'M0 0h4v3h-4zM4 1h0.5v1h-0.5' },
        ].map((f, i) => (
          <g key={f.l} transform={`translate(${i * 10}, 0)`}>
            <path d={f.d} fill="none" stroke={TECH_ACCENT} strokeWidth="0.3" />
            <text y={7} fontFamily="Helvetica, Arial, sans-serif" fontSize="1.3"
              fill="#a8b1c7" letterSpacing="1">{f.l}</text>
          </g>
        ))}
      </g>

      {/* compatibility */}
      <text x={X.back + 4} y={Y.body + 105} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill={TECH_ACCENT} letterSpacing="2">COMPATIBLE WITH</text>
      <line x1={X.back + 4} y1={Y.body + 107} x2={X.back + P.back - 4} y2={Y.body + 107}
        stroke={TECH_ACCENT} strokeWidth="0.15" opacity="0.5" />
      {[
        'iPad Air (4th generation)',
        'iPad Pro 11" (1 / 2 / 3 gen)',
        'iPad Pro 12.9" (3 / 4 / 5 gen)',
        'iOS 12.1+ · Android 6.0+',
        'Windows 10+ (drawing apps)',
      ].map((c, i) => (
        <text key={c} x={X.back + 4} y={Y.body + 112 + i * 4}
          fontFamily="Helvetica, Arial, sans-serif" fontSize="1.6" fill="#ffffff">
          — {c}
        </text>
      ))}

      {/* in the box */}
      <text x={X.back + 4} y={Y.body + 140} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill={TECH_ACCENT} letterSpacing="2">PACKAGE CONTENTS</text>
      <line x1={X.back + 4} y1={Y.body + 142} x2={X.back + P.back - 4} y2={Y.body + 142}
        stroke={TECH_ACCENT} strokeWidth="0.15" opacity="0.5" />
      <text x={X.back + 4} y={Y.body + 147} fontFamily="Helvetica, Arial, sans-serif"
        fontSize="1.6" fill="#ffffff">1× Stylus · 1× USB-C cable · 2× spare tips · Manual</text>

      {/* footer: certs + barcode */}
      <g transform={`translate(${X.back + 4}, ${Y.body + P.height - 22})`}>
        {['FC', 'CE', 'RoHS', 'WEEE'].map((c, i) => (
          <g key={c} transform={`translate(${i * 8}, 0)`}>
            <rect width="6.5" height="4" fill="none" stroke={TECH_ACCENT} strokeWidth="0.2" />
            <text x="3.25" y="3" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif"
              fontSize="1.6" fill={TECH_ACCENT}>{c}</text>
          </g>
        ))}
      </g>
      <g transform={`translate(${X.back + P.back - 22}, ${Y.body + P.height - 22})`}>
        {Array.from({ length: 22 }).map((_, i) => (
          <rect key={i} x={i * 0.7} y={0} width={i % 3 === 0 ? 0.35 : 0.2} height={8} fill="#ffffff" />
        ))}
        <text y={11} fontFamily="Helvetica, Arial, sans-serif" fontSize="1.4" fill="#ffffff">
          6 971234 500018
        </text>
      </g>
      <text x={X.back + P.back / 2} y={Y.body + P.height - 4} textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif" fontSize="1.3" fill="#7a8399" letterSpacing="1.5">
        DESIGNED BY INBEW · ASSEMBLED IN CHINA · inbew.com
      </text>
    </g>

    <rect x={X.glueR} y={Y.body} width={P.glueR} height={P.height} fill={TECH_INK} opacity="0.5" />

    <rect x={X.front + 4} y={Y.top + 0.3} width={P.front - 8} height={P.dust - 0.3} fill={TECH_MUTE} opacity="0.7" />
    <rect x={X.back + 4} y={Y.top + 0.3} width={P.back - 8} height={P.dust - 0.3} fill={TECH_MUTE} opacity="0.7" />
    <rect x={X.front + 3} y={Y.bottom} width={P.front - 6} height={P.tuck - 0.3} fill={TECH_MUTE} opacity="0.7" />
    <rect x={X.back + 3} y={Y.bottom} width={P.back - 6} height={P.tuck - 0.3} fill={TECH_MUTE} opacity="0.7" />
  </DielineFrame>
);

/* ---------- annotations ---------- */

const Dimensions = () => (
  <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono px-1">
    <span>0 mm</span>
    <span>panels: 15.5 · 51.5 · 16.0 · 51.5 · 15.5 mm  →  Ø {SHEET_W} mm × {P.height} mm</span>
    <span>{SHEET_W} mm</span>
  </div>
);

const Legend = () => (
  <div className="flex gap-6 mt-4 text-[11px] text-neutral-600">
    <div className="flex items-center gap-2">
      <span className="inline-block w-6 h-[2px]" style={{ background: CUT }} />
      Cut line
    </div>
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-6 h-[2px]"
        style={{ background: `repeating-linear-gradient(90deg, ${FOLD}, ${FOLD} 3px, transparent 3px, transparent 5px)` }}
      />
      Fold line
    </div>
    <div className="ml-auto font-mono">Scale 1 mm = {S} px on screen</div>
  </div>
);

/* ---------- assembled mockup ---------- */

const MockupCard = ({
  title,
  panel,
  direction,
}: {
  title: string;
  panel: 'front' | 'back';
  direction: Direction;
}) => {
  // preview at larger scale
  const scale = 4.2;
  return (
    <div className="rounded-xl bg-neutral-50 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-neutral-800">{title}</h3>
        <span className="text-[10px] text-neutral-400 font-mono">
          {P.front} × {P.height} mm
        </span>
      </div>
      <div className="flex justify-center">
        <svg
          width={P.front * scale}
          height={P.height * scale}
          viewBox={`0 0 ${P.front} ${P.height}`}
          style={{
            display: 'block',
            borderRadius: 4,
            boxShadow: '0 20px 60px -20px rgba(0,0,0,0.35), 0 4px 12px -4px rgba(0,0,0,0.15)',
          }}
        >
          {direction === 'editorial' ? (
            <EditorialPanel panel={panel} />
          ) : (
            <TechPanel panel={panel} />
          )}
        </svg>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[10px] text-neutral-400">
        <img src={inbewLogo} alt="inbew" className="h-3 opacity-60" />
        <span>reference render — geometry matches supplier dieline</span>
      </div>
    </div>
  );
};

const EditorialPanel = ({ panel }: { panel: 'front' | 'back' }) => (
  <>
    <rect width={P.front} height={P.height} fill={CREAM} />
    <rect x={2} y={2} width={P.front - 4} height={P.height - 4}
      fill="none" stroke={ACCENT} strokeWidth="0.2" />
    <g transform={`translate(${-X.front}, ${-Y.body})`}>
      {/* reuse pieces by translating from the dieline */}
      {panel === 'front' ? <EditorialFrontArt /> : <EditorialBackArt />}
    </g>
  </>
);

const EditorialFrontArt = () => (
  <g>
    <text x={X.front + P.front / 2} y={Y.body + 12} textAnchor="middle"
      fontFamily="Georgia, serif" fontSize="4" fill={INK}>inbew</text>
    <line x1={X.front + P.front / 2 - 8} y1={Y.body + 14} x2={X.front + P.front / 2 + 8} y2={Y.body + 14}
      stroke={ACCENT} strokeWidth="0.2" />
    <text x={X.front + P.front / 2} y={Y.body + 18} textAnchor="middle"
      fontFamily="Georgia, serif" fontSize="1.6" fill={INK} fontStyle="italic">
      precision instruments
    </text>
    <g transform={`translate(${X.front + P.front / 2}, ${Y.body + P.height / 2})`}>
      <line x1="0" y1="-55" x2="0" y2="55" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
      <polygon points="-1.6,55 1.6,55 0,62" fill={INK} />
    </g>
    <text x={X.front + P.front / 2} y={Y.body + P.height - 22} textAnchor="middle"
      fontFamily="Georgia, serif" fontSize="3.6" fill={INK}>Universal</text>
    <text x={X.front + P.front / 2} y={Y.body + P.height - 17} textAnchor="middle"
      fontFamily="Georgia, serif" fontSize="3.6" fill={INK} fontStyle="italic">Stylus Pen</text>
    <text x={X.front + P.front / 2} y={Y.body + P.height - 5} textAnchor="middle"
      fontFamily="Helvetica, Arial, sans-serif" fontSize="1.4" fill="#888" letterSpacing="1.5">
      iOS · ANDROID · WINDOWS
    </text>
  </g>
);

const EditorialBackArt = () => (
  <g>
    <text x={X.back + P.back / 2} y={Y.body + 10} textAnchor="middle"
      fontFamily="Helvetica, Arial, sans-serif" fontSize="1.6" fill="#555" letterSpacing="2">FEATURES</text>
    {[
      ['01', 'Magnetic'],
      ['02', 'Writes smoothly'],
      ['03', 'USB Type-C'],
      ['04', 'Long battery'],
    ].map(([n, l], i) => (
      <g key={n} transform={`translate(${X.back + 6}, ${Y.body + 24 + i * 18})`}>
        <text fontFamily="Georgia, serif" fontStyle="italic" fontSize="4" fill={ACCENT}>{n}</text>
        <text x={12} fontFamily="Georgia, serif" fontSize="3" fill={INK}>{l}</text>
      </g>
    ))}
    <text x={X.back + P.back / 2} y={Y.body + P.height - 4} textAnchor="middle"
      fontFamily="Helvetica, Arial, sans-serif" fontSize="1.4" fill="#888" letterSpacing="1.5">
      DESIGNED BY INBEW
    </text>
  </g>
);

const TechPanel = ({ panel }: { panel: 'front' | 'back' }) => (
  <>
    <rect width={P.front} height={P.height} fill={TECH_INK} />
    <g transform={`translate(${-X.front}, ${-Y.body})`}>
      {panel === 'front' ? <TechFrontArt /> : <TechBackArt />}
    </g>
  </>
);

const TechFrontArt = () => (
  <g>
    <text x={X.front + 4} y={Y.body + 10} fontFamily="Helvetica, Arial, sans-serif"
      fontSize="1.6" fill={TECH_ACCENT} letterSpacing="2">INBEW / ST-01</text>
    <g transform={`translate(${X.front + P.front / 2}, ${Y.body + 60})`}>
      <line x1="0" y1="-25" x2="0" y2="55" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
      <polygon points="-1.8,55 1.8,55 0,63" fill="#ffffff" />
    </g>
    <text x={X.front + 4} y={Y.body + P.height - 30} fontFamily="Helvetica, Arial, sans-serif"
      fontSize="5.5" fontWeight="700" fill="#ffffff">STYLUS</text>
    <text x={X.front + 4} y={Y.body + P.height - 24} fontFamily="Helvetica, Arial, sans-serif"
      fontSize="5.5" fontWeight="300" fill="#ffffff">PEN 01</text>
    <line x1={X.front + 4} y1={Y.body + P.height - 20} x2={X.front + P.front - 4} y2={Y.body + P.height - 20}
      stroke={TECH_ACCENT} strokeWidth="0.2" />
    <text x={X.front + 4} y={Y.body + P.height - 15} fontFamily="Helvetica, Arial, sans-serif"
      fontSize="1.6" fill="#a8b1c7" letterSpacing="1">MAGNETIC · TILT · PALM REJECTION</text>
  </g>
);

const TechBackArt = () => (
  <g>
    <text x={X.back + 4} y={Y.body + 10} fontFamily="Helvetica, Arial, sans-serif"
      fontSize="1.6" fill={TECH_ACCENT} letterSpacing="2">SPECIFICATIONS</text>
    {[
      ['MODEL', 'ST-01'],
      ['BATTERY', '140 mAh'],
      ['USE TIME', '10 h'],
      ['CHARGING', 'USB-C · 45 min'],
      ['WEIGHT', '14 g'],
    ].map(([k, v], i) => (
      <g key={k} transform={`translate(${X.back + 4}, ${Y.body + 24 + i * 8})`}>
        <text fontFamily="Helvetica, Arial, sans-serif" fontSize="1.6"
          fill="#7a8399" letterSpacing="1">{k}</text>
        <text x={P.back - 8} textAnchor="end" fontFamily="Helvetica, Arial, sans-serif"
          fontSize="2.2" fill="#ffffff">{v}</text>
      </g>
    ))}
  </g>
);

export default PackagingPreview;
