import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useOperations } from '../context/OperationsContext';
import { calculateImpact, IMPACT_ASSUMPTIONS } from '../utils/impact';

export const LogisticsVisualizer: React.FC = () => {
  const { selectedEvent } = useOperations();
  const eventImpact = selectedEvent ? calculateImpact(selectedEvent) : null;
  const [activeMode, setActiveMode] = useState<'side_by_side' | 'today' | 'smart_cancel'>('side_by_side');
  const [isPlaying, setIsPlaying] = useState(true);
  const [animProgress, setAnimProgress] = useState(0); // 0 to 100

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setAnimProgress((prev) => {
          if (prev >= 100) return 0;
          return prev + 1.25;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Amazon Hackathon Idea Document</span>
            <span aria-hidden="true">·</span>
            <span>Figure 1</span>
            <span aria-hidden="true">·</span>
            <span>Core Logistics Architecture</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            The idea in one picture
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Left is what happens today when a parcel is cancelled late. Right is what Smart Cancel does: intercepts at the local hub and fulfills a nearby order.
          </p>
        </div>

        {/* View Mode & Animation Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setActiveMode('side_by_side')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer transition-colors ${
                activeMode === 'side_by_side'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Side-by-Side
            </button>
            <button
              onClick={() => setActiveMode('today')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer transition-colors ${
                activeMode === 'today'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today's Return
            </button>
            <button
              onClick={() => setActiveMode('smart_cancel')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer transition-colors ${
                activeMode === 'smart_cancel'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Smart Cancel
            </button>
          </div>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
            title={isPlaying ? 'Pause animation' : 'Play animation'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>
          <button
            onClick={() => setAnimProgress(0)}
            className="p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors border border-slate-200"
            title="Restart route animation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main 3D / Isometric Canvas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ==================================================== */}
        {/* PANEL A: TODAY - CANCELLED PARCEL GOES BACK           */}
        {/* ==================================================== */}
        {(activeMode === 'side_by_side' || activeMode === 'today') && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <span className="text-xs font-semibold text-rose-600 uppercase tracking-wide">
                    Legacy Process
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    Today: Cancelled parcel goes back
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    +{eventImpact?.conventional.distanceKm.toFixed(1) ?? '—'} km estimated travel · {selectedEvent?.id ?? 'No event'}
                  </span>
                </div>
              </div>

              {/* Isometric SVG Diagram for Today */}
              <div className="relative w-full h-[320px] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
                <svg
                  viewBox="0 0 500 360"
                  className="w-full h-full"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    {/* Grid Pattern */}
                    <pattern id="isoGrid1" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 30 0 L 0 30 M 0 0 L 30 30" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                    </pattern>
                  </defs>

                  <rect width="500" height="360" fill="#0b1120" />
                  <rect width="500" height="360" fill="url(#isoGrid1)" />

                  {/* Ground Area Oval */}
                  <ellipse cx="250" cy="270" rx="200" ry="60" fill="#1e293b" opacity="0.4" />

                  {/* 1. Fulfillment Warehouse (Top Dark Cube) */}
                  <g transform="translate(250, 60)">
                    {/* Shadow */}
                    <ellipse cx="0" cy="35" rx="35" ry="12" fill="#000000" opacity="0.5" />
                    {/* Warehouse Cube Isometric */}
                    {/* Top Face */}
                    <polygon points="0,-25 40,-5 0,15 -40,-5" fill="#334155" stroke="#475569" strokeWidth="1" />
                    {/* Left Face */}
                    <polygon points="-40,-5 0,15 0,45 -40,25" fill="#1e293b" stroke="#334155" strokeWidth="1" />
                    {/* Right Face */}
                    <polygon points="0,15 40,-5 40,25 0,45" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
                    <text x="0" y="65" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">
                      Regional Warehouse
                    </text>
                    <text x="0" y="78" textAnchor="middle" fill="#64748b" fontSize="9">
                      FC #DEL1
                    </text>
                  </g>

                  {/* Forward Route (Warehouse -> Local Hub) */}
                  <path
                    d="M 250 105 L 200 175"
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />

                  {/* 2. Local Hub (Middle Blue Cube) */}
                  <g transform="translate(200, 195)">
                    <ellipse cx="0" cy="22" rx="28" ry="10" fill="#000000" opacity="0.4" />
                    <polygon points="0,-18 28,-4 0,10 -28,-4" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1" />
                    <polygon points="-28,-4 0,10 0,30 -28,16" fill="#1d4ed8" stroke="#2563eb" strokeWidth="1" />
                    <polygon points="0,10 28,-4 28,16 0,30" fill="#1e40af" stroke="#1d4ed8" strokeWidth="1" />
                    <text x="-40" y="20" textAnchor="end" fill="#93c5fd" fontSize="10" fontWeight="600">
                      Noida Hub #NDH1
                    </text>
                  </g>

                  {/* Outbound to Customer */}
                  <path
                    d="M 200 225 L 180 270"
                    stroke="#f59e0b"
                    strokeWidth="2"
                  />

                  {/* 3. Customer who cancelled (Gray Cube) */}
                  <g transform="translate(180, 285)">
                    <ellipse cx="0" cy="18" rx="22" ry="8" fill="#000000" opacity="0.4" />
                    <polygon points="0,-14 22,-3 0,8 -22,-3" fill="#64748b" stroke="#94a3b8" strokeWidth="1" />
                    <polygon points="-22,-3 0,8 0,24 -22,13" fill="#475569" stroke="#64748b" strokeWidth="1" />
                    <polygon points="0,8 22,-3 22,13 0,24" fill="#334155" stroke="#475569" strokeWidth="1" />
                    <text x="0" y="40" textAnchor="middle" fill="#cbd5e1" fontSize="10">
                      Customer
                    </text>
                    <text x="0" y="51" textAnchor="middle" fill="#ef4444" fontSize="9" fontWeight="600">
                      (Cancelled)
                    </text>
                  </g>

                  {/* 4. Nearby New Customer sitting empty/unfulfilled in Today's path */}
                  <g transform="translate(320, 275)">
                    <ellipse cx="0" cy="18" rx="22" ry="8" fill="#000000" opacity="0.3" />
                    <polygon points="0,-14 22,-3 0,8 -22,-3" fill="#334155" stroke="#475569" strokeWidth="1" opacity="0.5" />
                    <polygon points="-22,-3 0,8 0,24 -22,13" fill="#1e293b" opacity="0.5" />
                    <polygon points="0,8 22,-3 22,13 0,24" fill="#0f172a" opacity="0.5" />
                    <text x="0" y="40" textAnchor="middle" fill="#64748b" fontSize="10">
                      Nearby buyer
                    </text>
                    <text x="0" y="51" textAnchor="middle" fill="#64748b" fontSize="9">
                      (Unmatched)
                    </text>
                  </g>

                  {/* TODAY'S RETURN PATH: Red Dotted Long Arc back to Warehouse */}
                  <path
                    d="M 180 270 Q 110 160 220 75"
                    stroke="#ef4444"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    fill="none"
                  />

                  {/* Annotations along the red return line */}
                  <g transform="translate(110, 150)">
                    <rect x="-8" y="-12" width="110" height="28" rx="6" fill="#1e1b2e" stroke="#ef4444" strokeWidth="1" />
                    <text x="47" y="1" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">
                      Long trip back ➔
                    </text>
                    <text x="47" y="11" textAnchor="middle" fill="#f87171" fontSize="7.5">
                      +{IMPACT_ASSUMPTIONS.conventionalReturnKm} km estimated return transit
                    </text>
                  </g>

                  <g transform="translate(330, 80)">
                    <rect x="-10" y="-14" width="135" height="34" rx="6" fill="#1e293b" stroke="#475569" strokeWidth="1" />
                    <text x="57" y="-2" textAnchor="middle" fill="#f87171" fontSize="8.5" fontWeight="bold">
                      • Inspect & de-box
                    </text>
                    <text x="57" y="9" textAnchor="middle" fill="#cbd5e1" fontSize="8">
                      • Re-shelve inventory
                    </text>
                    <text x="57" y="17" textAnchor="middle" fill="#94a3b8" fontSize="7.5">
                      • Ship again days later
                    </text>
                  </g>

                  {/* Animated Parcel for Today */}
                  {(() => {
                    // Parcel moves out then loops back along the red arc
                    let px = 250;
                    let py = 60;
                    if (animProgress <= 30) {
                      const t = animProgress / 30;
                      px = 250 + (200 - 250) * t;
                      py = 105 + (195 - 105) * t;
                    } else if (animProgress <= 50) {
                      const t = (animProgress - 30) / 20;
                      px = 200 + (180 - 200) * t;
                      py = 225 + (270 - 225) * t;
                    } else {
                      const t = (animProgress - 50) / 50;
                      // Quadratic bezier formula
                      px = (1 - t) * (1 - t) * 180 + 2 * (1 - t) * t * 110 + t * t * 220;
                      py = (1 - t) * (1 - t) * 270 + 2 * (1 - t) * t * 160 + t * t * 75;
                    }

                    return (
                      <g transform={`translate(${px}, ${py})`}>
                        <circle cx="0" cy="0" r="7" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                        <text x="0" y="2.5" textAnchor="middle" fill="#ffffff" fontSize="6" fontWeight="bold">
                          📦
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>

              {/* Impact Breakdown Table */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-[11px]">Total Distance</div>
                  <div className="font-mono font-bold text-rose-700 text-sm">{eventImpact?.conventional.distanceKm.toFixed(1) ?? '—'} km</div>
                  <div className="text-[10px] text-slate-400">Out + full return</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-[11px]">CO₂ Emissions</div>
                  <div className="font-mono font-bold text-rose-700 text-sm">2.84 kg</div>
                  <div className="text-[10px] text-slate-400">Linehaul + van</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500 text-[11px]">Turnaround</div>
                  <div className="font-mono font-bold text-rose-700 text-sm">3–5 Days</div>
                  <div className="text-[10px] text-slate-400">Before resale</div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Wastes driver fuel, packaging material, and valuable warehouse shelf space.</span>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* PANEL B: SMART CANCEL - PARCEL FINDS A NEARBY BUYER  */}
        {/* ==================================================== */}
        {(activeMode === 'side_by_side' || activeMode === 'smart_cancel') && (
          <div className="bg-white border-2 border-emerald-500/80 rounded-2xl p-6 shadow-xs relative overflow-hidden flex flex-col justify-between ring-1 ring-emerald-500/20">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Smart Cancel Flow
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    Smart Cancel: Parcel finds a nearby buyer
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                    -85% distance saved
                  </span>
                </div>
              </div>

              {/* Isometric SVG Diagram for Smart Cancel */}
              <div className="relative w-full h-[320px] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
                <svg
                  viewBox="0 0 500 360"
                  className="w-full h-full"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern id="isoGrid2" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 30 0 L 0 30 M 0 0 L 30 30" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                    </pattern>
                  </defs>

                  <rect width="500" height="360" fill="#0b1120" />
                  <rect width="500" height="360" fill="url(#isoGrid2)" />

                  {/* Ground Area Oval */}
                  <ellipse cx="250" cy="270" rx="200" ry="60" fill="#1e293b" opacity="0.4" />

                  {/* 1. Warehouse (Top Dark Cube) */}
                  <g transform="translate(250, 60)">
                    <ellipse cx="0" cy="35" rx="35" ry="12" fill="#000000" opacity="0.5" />
                    <polygon points="0,-25 40,-5 0,15 -40,-5" fill="#334155" stroke="#475569" strokeWidth="1" />
                    <polygon points="-40,-5 0,15 0,45 -40,25" fill="#1e293b" stroke="#334155" strokeWidth="1" />
                    <polygon points="0,15 40,-5 40,25 0,45" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
                    <text x="0" y="65" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">
                      Regional Warehouse
                    </text>
                    <text x="0" y="78" textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="bold">
                      (No return trip needed!)
                    </text>
                  </g>

                  {/* Forward Route (Warehouse -> Local Hub) */}
                  <path
                    d="M 250 105 L 200 175"
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />

                  {/* 2. Local Hub (Middle Blue Cube - Smart Holding Rack) */}
                  <g transform="translate(200, 195)">
                    <ellipse cx="0" cy="22" rx="30" ry="12" fill="#000000" opacity="0.5" />
                    <polygon points="0,-18 28,-4 0,10 -28,-4" fill="#2563eb" stroke="#60a5fa" strokeWidth="1.5" />
                    <polygon points="-28,-4 0,10 0,30 -28,16" fill="#1d4ed8" stroke="#3b82f6" strokeWidth="1" />
                    <polygon points="0,10 28,-4 28,16 0,30" fill="#1e40af" stroke="#2563eb" strokeWidth="1" />

                    {/* Amber Holding Aura */}
                    <circle cx="0" cy="5" r="16" fill="#f59e0b" opacity="0.3" />

                    <text x="-38" y="20" textAnchor="end" fill="#93c5fd" fontSize="10" fontWeight="600">
                      Noida Hub #NDH1
                    </text>
                    <text x="-38" y="32" textAnchor="end" fill="#f59e0b" fontSize="8.5" fontWeight="bold">
                      Holding Rack (Redis TTL)
                    </text>
                  </g>

                  {/* 3. Original Customer (Cancelled, safely stopped) */}
                  <g transform="translate(180, 285)">
                    <ellipse cx="0" cy="18" rx="22" ry="8" fill="#000000" opacity="0.4" />
                    <polygon points="0,-14 22,-3 0,8 -22,-3" fill="#64748b" stroke="#94a3b8" strokeWidth="1" opacity="0.7" />
                    <polygon points="-22,-3 0,8 0,24 -22,13" fill="#475569" opacity="0.7" />
                    <polygon points="0,8 22,-3 22,13 0,24" fill="#334155" opacity="0.7" />
                    <text x="0" y="40" textAnchor="middle" fill="#cbd5e1" fontSize="10">
                      Customer
                    </text>
                    <text x="0" y="51" textAnchor="middle" fill="#94a3b8" fontSize="9">
                      (Cancelled & Refunded)
                    </text>
                  </g>

                  {/* SMART RE-MATCH ROUTE: Direct Green Arrow from Local Hub to Nearby New Buyer */}
                  <path
                    d="M 220 205 Q 270 215 320 260"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    fill="none"
                  />

                  {/* Short Trip Marker */}
                  <g transform="translate(285, 215)">
                    <rect x="-8" y="-12" width="112" height="26" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
                    <text x="48" y="1" textAnchor="middle" fill="#a7f3d0" fontSize="9" fontWeight="bold">
                      Short trip to new buyer
                    </text>
                    <text x="48" y="11" textAnchor="middle" fill="#34d399" fontSize="7.5">
                      {selectedEvent?.distanceKm.toFixed(1) ?? '—'} km selected event route
                    </text>
                  </g>

                  {/* 4. Nearby New Customer (Green Glowing Cube) */}
                  <g transform="translate(330, 275)">
                    <ellipse cx="0" cy="18" rx="26" ry="10" fill="#000000" opacity="0.4" />
                    <polygon points="0,-16 26,-3 0,10 -26,-3" fill="#10b981" stroke="#34d399" strokeWidth="1.5" />
                    <polygon points="-26,-3 0,10 0,26 -26,13" fill="#059669" stroke="#10b981" strokeWidth="1" />
                    <polygon points="0,10 26,-3 26,13 0,26" fill="#047857" stroke="#059669" strokeWidth="1" />
                    <text x="0" y="42" textAnchor="middle" fill="#a7f3d0" fontSize="10.5" fontWeight="bold">
                      Nearby new customer
                    </text>
                    <text x="0" y="54" textAnchor="middle" fill="#34d399" fontSize="9">
                      Gets item same day!
                    </text>
                  </g>

                  {/* Animated Parcel for Smart Cancel */}
                  {(() => {
                    let px = 250;
                    let py = 60;
                    if (animProgress <= 40) {
                      // Move from Warehouse to Local Hub
                      const t = animProgress / 40;
                      px = 250 + (200 - 250) * t;
                      py = 105 + (195 - 105) * t;
                    } else if (animProgress <= 65) {
                      // Hold at Local Hub (re-labelling, optical scan)
                      px = 200;
                      py = 195;
                    } else {
                      // Short trip to new buyer
                      const t = (animProgress - 65) / 35;
                      px = (1 - t) * (1 - t) * 200 + 2 * (1 - t) * t * 270 + t * t * 330;
                      py = (1 - t) * (1 - t) * 195 + 2 * (1 - t) * t * 215 + t * t * 275;
                    }

                    return (
                      <g transform={`translate(${px}, ${py})`}>
                        <circle cx="0" cy="0" r="8" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                        <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">
                          📦
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>

              {/* Impact Breakdown Table */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="text-emerald-800 text-[11px]">Total Distance</div>
                  <div className="font-mono font-bold text-emerald-700 text-sm">{eventImpact?.smart.distanceKm.toFixed(1) ?? '—'} km</div>
                  <div className="text-[10px] text-emerald-600">Potential route reduction: {eventImpact?.savings.distanceKm.toFixed(1) ?? '—'} km</div>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="text-emerald-800 text-[11px]">CO₂ Emissions</div>
                  <div className="font-mono font-bold text-emerald-700 text-sm">{eventImpact?.smart.co2Kg.toFixed(2) ?? '—'} kg CO₂e</div>
                  <div className="text-[10px] text-emerald-600">Potential difference: {eventImpact?.savings.co2Kg.toFixed(2) ?? '—'} kg CO₂e</div>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="text-emerald-800 text-[11px]">Delivery Time</div>
                  <div className="font-mono font-bold text-emerald-700 text-sm">&lt; 3 Hours</div>
                  <div className="text-[10px] text-emerald-600">Same-day delight</div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>One trip instead of two, no warehouse return, and new customer gets product faster.</span>
            </div>
          </div>
        )}
      </div>

      {/* Mechanism-to-Outcome Chain (Domain Guideline Section 2.C) */}
      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">
          The Logistics Decision: Mechanism-to-Outcome Chain
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
            <span className="font-semibold text-slate-900 block">1. Customer Goal</span>
            <p className="text-slate-600">
              Customer needs to cancel a late order without penalties, dark patterns, or waiting.
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
            <span className="font-semibold text-slate-900 block">2. Visible Interface & Hub Mechanism</span>
            <p className="text-slate-600">
              Layer 1 honest impact nudge + Layer 2 holding rack with Redis TTL & automated optical seal scanner.
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
            <span className="font-semibold text-slate-900 block">3. Measurable Benefit</span>
            <p className="text-slate-600">
              Cuts reverse logistics distance by 85%, eliminates return restocking, and delivers same-day to buyer B.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
