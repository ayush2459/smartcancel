import React, { useState } from 'react';
import { FULFILLMENT_STAGES } from '../data/mockData';
import { ShieldCheck, Truck, Package, MapPin, Gauge } from 'lucide-react';
import { useOperations } from '../context/OperationsContext';

export const ScoreCalculator: React.FC = () => {
  const { selectedEvent, updateSelectedEvent } = useOperations();
  const [selectedLevel, setSelectedLevel] = useState<number>(3); // 1 to 4
  const [distanceKm, setDistanceKm] = useState<number>(24);
  const [packagingType, setPackagingType] = useState<'envelope' | 'standard' | 'heavy'>('standard');
  const [driverDispatched, setDriverDispatched] = useState<boolean>(true);

  // Compute composite score dynamically
  const baseStageScores = [12, 38, 64, 88];
  const packagingAdders = { envelope: 0, standard: 4, heavy: 9 };
  const distanceAdder = Math.min(10, Math.round(distanceKm * 0.15));
  const driverAdder = driverDispatched ? 6 : 0;

  const rawScore =
    baseStageScores[selectedLevel - 1] +
    packagingAdders[packagingType] +
    (selectedLevel >= 3 ? distanceAdder : 0) +
    (selectedLevel === 4 ? driverAdder : 0);

  const calculatedScore = Math.min(100, Math.max(0, rawScore));

  const currentStage = FULFILLMENT_STAGES[selectedLevel - 1];

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>Amazon Hackathon Idea Document</span>
          <span aria-hidden="true">·</span>
          <span>Figure 3 & Section 4</span>
          <span aria-hidden="true">·</span>
          <span>Quantified Friction Metric</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Fulfillment Irreversibility Score (0 to 100)
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          A simple 0 to 100 score that tells us how costly it is to cancel at this moment. The customer sees it as an intuitive progress bar; the logistics system uses it to choose the cheapest operational action.
        </p>
      </div>

      {selectedEvent && <div className="mb-5 rounded-xl border border-amber-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="text-[10px] font-bold text-amber-700">SHARED SELECTED EVENT · {selectedEvent.id}</div><div className="text-sm font-semibold mt-1">Current event score: {selectedEvent.score}/100 · {selectedEvent.stage}</div><div className="text-[10px] text-slate-500">Local score controls below can be applied to this event.</div></div><button onClick={()=>updateSelectedEvent({score:calculatedScore,stage:currentStage.name.replace(/^Level \d: /,''),distanceKm})} className="px-3 py-2 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold">Apply score to selected event</button></div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 3D Bar Representation (Figure 3 in PDF) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
            <h2 className="text-sm font-bold text-slate-900">
              Figure 3: The score rises as parcel moves through the network
            </h2>
            <div className="text-xs font-mono font-bold text-slate-600">
              0 = Cheap to stop · 100 = Most waste
            </div>
          </div>

          {/* SVG 3D Isometric Stepped Blocks */}
          <div className="relative w-full h-[320px] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
            <svg
              viewBox="0 0 520 300"
              className="w-full h-full"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Subtle Floor Grid */}
              <defs>
                <pattern id="scoreGrid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 25 M 0 0 L 25 25" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="520" height="300" fill="#090d16" />
              <rect width="520" height="300" fill="url(#scoreGrid)" />

              {/* Baseline Horizontal Axis Arrow */}
              <line x1="40" y1="260" x2="480" y2="260" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 4" />
              <polygon points="485,260 475,255 475,265" fill="#475569" />
              <text x="260" y="280" textAnchor="middle" fill="#64748b" fontSize="10" fontStyle="italic">
                parcel moves through the network ➔
              </text>

              {/* Level 1: Ordered (Green 0-25, Low height) */}
              <g
                transform="translate(85, 230)"
                className="cursor-pointer"
                onClick={() => setSelectedLevel(1)}
              >
                <polygon points="0,-15 32,-3 0,9 -32,-3" fill="#10b981" stroke="#34d399" strokeWidth="1" />
                <polygon points="-32,-3 0,9 0,25 -32,13" fill="#059669" stroke="#10b981" strokeWidth="1" />
                <polygon points="0,9 32,-3 32,9 0,25" fill="#047857" stroke="#059669" strokeWidth="1" />
                <text x="0" y="-24" textAnchor="middle" fill="#a7f3d0" fontSize="9" fontWeight="bold">
                  Score 0–25
                </text>
                <text x="0" y="42" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="600">
                  Level 1
                </text>
                <text x="0" y="54" textAnchor="middle" fill="#94a3b8" fontSize="8.5">
                  Ordered
                </text>
              </g>

              {/* Level 2: Picked / Packed (Yellow-Amber 26-50, Medium-low) */}
              <g
                transform="translate(195, 205)"
                className="cursor-pointer"
                onClick={() => setSelectedLevel(2)}
              >
                <polygon points="0,-28 32,-16 0,-4 -32,-16" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1" />
                <polygon points="-32,-16 0,-4 0,50 -32,38" fill="#d97706" stroke="#f59e0b" strokeWidth="1" />
                <polygon points="0,-4 32,-16 32,38 0,50" fill="#b45309" stroke="#d97706" strokeWidth="1" />
                <text x="0" y="-38" textAnchor="middle" fill="#fde68a" fontSize="9" fontWeight="bold">
                  Score 26–50
                </text>
                <text x="0" y="67" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="600">
                  Level 2
                </text>
                <text x="0" y="79" textAnchor="middle" fill="#94a3b8" fontSize="8.5">
                  Picked / Packed
                </text>
              </g>

              {/* Level 3: In Transit (Orange 51-75, Tall) */}
              <g
                transform="translate(305, 175)"
                className="cursor-pointer"
                onClick={() => setSelectedLevel(3)}
              >
                <polygon points="0,-45 32,-33 0,-21 -32,-33" fill="#ea580c" stroke="#fb923c" strokeWidth="1" />
                <polygon points="-32,-33 0,-21 0,80 -32,68" fill="#c2410c" stroke="#ea580c" strokeWidth="1" />
                <polygon points="0,-21 32,-33 32,68 0,80" fill="#9a3412" stroke="#c2410c" strokeWidth="1" />
                <text x="0" y="-55" textAnchor="middle" fill="#fed7aa" fontSize="9" fontWeight="bold">
                  Score 51–75
                </text>
                <text x="0" y="97" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="600">
                  Level 3
                </text>
                <text x="0" y="109" textAnchor="middle" fill="#94a3b8" fontSize="8.5">
                  In Transit
                </text>
              </g>

              {/* Level 4: Last Mile (Red 76-100, Maximum height) */}
              <g
                transform="translate(415, 140)"
                className="cursor-pointer"
                onClick={() => setSelectedLevel(4)}
              >
                <polygon points="0,-60 32,-48 0,-36 -32,-48" fill="#dc2626" stroke="#f87171" strokeWidth="1" />
                <polygon points="-32,-48 0,-36 0,115 -32,103" fill="#b91c1c" stroke="#dc2626" strokeWidth="1" />
                <polygon points="0,-36 32,-48 32,103 0,115" fill="#991b1b" stroke="#b91c1c" strokeWidth="1" />
                <text x="0" y="-70" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">
                  Score 76–100
                </text>
                <text x="0" y="132" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="600">
                  Level 4
                </text>
                <text x="0" y="144" textAnchor="middle" fill="#94a3b8" fontSize="8.5">
                  Last Mile
                </text>
              </g>
            </svg>
          </div>

          {/* Reference Table matching Page 4 */}
          <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">What it means</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {FULFILLMENT_STAGES.map((stg, i) => (
                  <tr
                    key={stg.id}
                    onClick={() => setSelectedLevel(i + 1)}
                    className={`cursor-pointer transition-colors ${
                      selectedLevel === i + 1 ? 'bg-amber-50/80 font-medium' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{stg.name}</td>
                    <td className="py-2.5 px-3 font-mono">{stg.scoreRange}</td>
                    <td className="py-2.5 px-3 text-slate-600">{stg.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Composite Score Calculator */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-amber-500" />
                Live Composite Calculator
              </h2>
              <div className="text-right">
                <span className="text-2xl font-mono font-bold text-slate-900 tabular-nums">
                  {calculatedScore}
                </span>
                <span className="text-xs text-slate-500"> / 100</span>
              </div>
            </div>

            {/* Stage Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-800 block">
                Primary Logistics Stage:
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {FULFILLMENT_STAGES.map((stg, idx) => (
                  <button
                    key={stg.id}
                    onClick={() => setSelectedLevel(idx + 1)}
                    className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                      selectedLevel === idx + 1
                        ? 'border-slate-900 bg-slate-900 text-white font-bold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>Level {idx + 1}</div>
                    <div className="text-[10px] opacity-80">{stg.id.replace('_', ' ')}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Distance Slider */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs font-medium text-slate-800">
                <span>Distance Traveled from FC:</span>
                <span className="font-mono font-bold">{distanceKm} km</span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Packaging type */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-800 block">
                Packaging Material Consumed:
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  onClick={() => setPackagingType('envelope')}
                  className={`p-2 rounded border text-center cursor-pointer ${
                    packagingType === 'envelope'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Padded Mailer
                </button>
                <button
                  onClick={() => setPackagingType('standard')}
                  className={`p-2 rounded border text-center cursor-pointer ${
                    packagingType === 'standard'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Carton Box + Tape
                </button>
                <button
                  onClick={() => setPackagingType('heavy')}
                  className={`p-2 rounded border text-center cursor-pointer ${
                    packagingType === 'heavy'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Heavy / Palletized
                </button>
              </div>
            </div>

            {/* Last mile driver assignment */}
            {selectedLevel === 4 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-800 block">
                  Van Driver Staging:
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={driverDispatched}
                      onChange={(e) => setDriverDispatched(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>Driver actively on last-mile delivery route</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Policy routing summary */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs space-y-2">
            <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wide">
              Operational Gate Triggered
            </span>
            <div className="text-sm font-bold">
              {calculatedScore <= 50
                ? 'Standard Stop (Zero friction, no nudge card)'
                : 'Late Cancellation Intercept (Layer 1 Nudge + Hub Routing)'}
            </div>
            <p className="text-xs text-slate-300">
              {calculatedScore <= 50
                ? 'The order is halted automatically in the warehouse staging system. Reverse freight is completely avoided.'
                : 'Customer is shown honest travel & packaging numbers. If cancelled, parcel routes directly to the nearest local station holding rack for matching.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
