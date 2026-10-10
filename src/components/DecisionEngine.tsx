import React, { useEffect, useState } from 'react';
import { Check, ArrowRight, Play, RotateCcw, AlertCircle, Sparkles } from 'lucide-react';
import { useOperations } from '../context/OperationsContext';

interface ScenarioPreset {
  id: string;
  title: string;
  description: string;
  score: number;
  nudgeAction: 'keep' | 'cancel';
  isEligible: boolean;
  demandHigh: boolean;
}

const PRESETS: ScenarioPreset[] = [
  {
    id: 'p1',
    title: '1. Early Cancel (Ordered)',
    description: 'Score 15 (0–50). Stopped before packing. Zero fuel wasted.',
    score: 15,
    nudgeAction: 'cancel',
    isEligible: true,
    demandHigh: true,
  },
  {
    id: 'p2',
    title: '2. Nudge Convinces Customer',
    description: 'Score 85. Customer sees CO2 impact and taps "Keep my order".',
    score: 85,
    nudgeAction: 'keep',
    isEligible: true,
    demandHigh: true,
  },
  {
    id: 'p3',
    title: '3. Full Smart Cancel Re-Match',
    description: 'Score 85, cancels anyway, eligible item, high demand. Intercepted & matched!',
    score: 85,
    nudgeAction: 'cancel',
    isEligible: true,
    demandHigh: true,
  },
  {
    id: 'p4',
    title: '4. Ineligible Perishable Item',
    description: 'Fresh groceries or broken seal. Safely falls back to warehouse return.',
    score: 85,
    nudgeAction: 'cancel',
    isEligible: false,
    demandHigh: true,
  },
  {
    id: 'p5',
    title: '5. Low Demand Pincode',
    description: 'Niche book in sparse pincode. Fallback to normal warehouse return.',
    score: 70,
    nudgeAction: 'cancel',
    isEligible: true,
    demandHigh: false,
  },
];

export const DecisionEngine: React.FC = () => {
  const { selectedEvent, updateSelectedEvent } = useOperations();
  const [score, setScore] = useState<number>(85);
  const [nudgeKept, setNudgeKept] = useState<boolean>(false);
  const [isEligible, setIsEligible] = useState<boolean>(true);
  const [isDemandHigh, setIsDemandHigh] = useState<boolean>(true);
  useEffect(() => {
    if (!selectedEvent) return;
    setScore(selectedEvent.score);
    setIsEligible(selectedEvent.eligible);
    setIsDemandHigh(selectedEvent.demand >= 75);
    setNudgeKept(selectedEvent.customerKept);
  }, [selectedEvent?.id, selectedEvent?.score, selectedEvent?.status]);

  // Derive decision path
  const isEarly = score <= 50;
  const isNudgeShown = !isEarly;
  const nudgeWorked = isNudgeShown && nudgeKept;
  const passedEligibility = isNudgeShown && !nudgeKept && isEligible;
  const passedDemand = passedEligibility && isDemandHigh;

  // Final outcome classification
  let finalOutcome: 'early_stop' | 'nudge_worked' | 'smart_rematch' | 'warehouse_fallback';
  if (isEarly) {
    finalOutcome = 'early_stop';
  } else if (nudgeWorked) {
    finalOutcome = 'nudge_worked';
  } else if (passedDemand) {
    finalOutcome = 'smart_rematch';
  } else {
    finalOutcome = 'warehouse_fallback';
  }

  const applyPreset = (p: ScenarioPreset) => {
    setScore(p.score);
    setNudgeKept(p.nudgeAction === 'keep');
    setIsEligible(p.isEligible);
    setIsDemandHigh(p.demandHigh);
    const stage=p.score<=25?'Ordered':p.score<=50?'Packed':p.score<=75?'In transit':'Last mile';
    updateSelectedEvent({score:p.score,stage,customerKept:p.nudgeAction==='keep',eligible:p.isEligible,demand:p.demandHigh?85:55});
  };

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>Amazon Hackathon Idea Document</span>
          <span aria-hidden="true">·</span>
          <span>Figure 2</span>
          <span aria-hidden="true">·</span>
          <span>Decision Logic Engine</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Cancel decision flow
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Every cancel request goes through the same short chain of checks. Early cancels are simply stopped. Late cancels see the impact card, then pass eligibility and demand gates.
        </p>
      </div>

      {/* Preset Scenario Pills / Segmented Selector */}
      <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="text-xs font-semibold text-slate-800 mb-2">
          Test Scenarios (Click to simulate):
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className="p-2.5 rounded-lg border border-slate-200 bg-white hover:border-amber-400 hover:bg-amber-50/40 text-left cursor-pointer transition-colors"
            >
              <div className="text-xs font-bold text-slate-900">{p.title}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{p.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Flowchart Interactive Diagram */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
            <h2 className="text-sm font-bold text-slate-900">
              Live Flowchart Evaluation
            </h2>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Good outcome
              </span>
              <span className="flex items-center gap-1.5 text-amber-600">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Smart Cancel path
              </span>
              <span className="flex items-center gap-1.5 text-rose-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Fallback (warehouse)
              </span>
            </div>
          </div>

          {/* Flowchart Diagram Layout */}
          <div className="space-y-4 max-w-2xl mx-auto py-2">
            {/* Step 1: Customer Taps Cancel */}
            <div className="flex justify-center">
              <div className="px-6 py-3 bg-slate-900 text-white font-bold text-sm rounded-xl shadow-sm ring-4 ring-slate-100 text-center">
                Customer taps Cancel
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-0.5 h-6 bg-slate-300" />
            </div>

            {/* Step 2: Check Order Stage */}
            <div className="flex justify-center">
              <div className="px-6 py-2.5 bg-slate-100 border border-slate-300 text-slate-900 font-semibold text-xs rounded-xl shadow-xs text-center max-w-xs">
                Check order stage
                <div className="text-[11px] font-mono text-slate-600 font-normal">
                  (Irreversibility Score: {score}/100)
                </div>
              </div>
            </div>

            {/* Split Fork */}
            <div className="grid grid-cols-2 gap-8 pt-2 relative">
              {/* Left Branch: Ordered / Packed (score 0-50) */}
              <div className="space-y-4 flex flex-col items-center">
                <div
                  className={`w-full p-3 rounded-xl border text-center transition-all ${
                    isEarly
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold ring-2 ring-emerald-400/40 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="text-xs">Ordered / Packed</div>
                  <div className="text-[10px] font-mono">(score 0–50)</div>
                </div>

                <div className="w-0.5 h-6 bg-slate-300" />

                {/* Leaf: Stop the order */}
                <div
                  className={`w-full p-3.5 rounded-xl border text-center transition-all ${
                    isEarly
                      ? 'bg-emerald-600 border-emerald-700 text-white font-bold shadow-md'
                      : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-bold">Stop the order</div>
                  <div className="text-[11px] opacity-90">(cheap, easy)</div>
                  {isEarly && (
                    <div className="mt-1 text-[10px] font-semibold bg-emerald-700/60 py-0.5 px-2 rounded inline-block">
                      ✓ Execution Complete
                    </div>
                  )}
                </div>
              </div>

              {/* Right Branch: In Transit / Last Mile (score 51-100) */}
              <div className="space-y-4 flex flex-col items-center">
                <div
                  className={`w-full p-3 rounded-xl border text-center transition-all ${
                    !isEarly
                      ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold ring-2 ring-amber-400/40 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="text-xs">In Transit / Last Mile</div>
                  <div className="text-[10px] font-mono">(score 51–100)</div>
                </div>

                <div className="w-0.5 h-6 bg-slate-300" />

                {/* Show Impact Card */}
                <div
                  className={`w-full p-2.5 rounded-xl border text-center text-xs transition-all ${
                    !isEarly
                      ? 'bg-amber-100/70 border-amber-300 text-amber-950 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  Show impact card (real numbers)
                </div>

                <div className="w-0.5 h-6 bg-slate-300" />

                {/* Decision Gate: Customer still cancels? */}
                <div
                  className={`w-full p-3 rounded-xl border text-center text-xs transition-all ${
                    !isEarly
                      ? 'bg-white border-slate-400 text-slate-900 font-bold shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  Customer still cancels?
                  <div className="text-[11px] font-normal text-slate-600 mt-0.5">
                    {nudgeKept ? 'No (Tapped Keep my order)' : 'Yes (Tapped Cancel anyway)'}
                  </div>
                </div>

                {/* If No -> Order continues */}
                {nudgeKept && !isEarly && (
                  <div className="w-full p-3.5 bg-emerald-600 text-white rounded-xl text-center shadow-md animate-in fade-in">
                    <div className="text-xs font-bold">Order continues</div>
                    <div className="text-[11px] opacity-90">(nudge worked!)</div>
                  </div>
                )}

                {/* If Yes -> Gate: Product eligible? */}
                {!nudgeKept && !isEarly && (
                  <div className="w-full space-y-4">
                    <div className="flex justify-center">
                      <div className="w-0.5 h-5 bg-slate-300" />
                    </div>

                    <div className="p-3 bg-white border border-slate-400 rounded-xl text-center text-xs font-bold text-slate-900 shadow-xs">
                      Product eligible?
                      <div className="text-[11px] font-normal text-slate-600 mt-0.5">
                        {isEligible ? 'Yes (Sealed, standard stock)' : 'No (Perishable or custom)'}
                      </div>
                    </div>

                    {!isEligible && (
                      <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-center text-xs font-bold shadow-xs animate-in fade-in">
                        Warehouse return
                        <div className="text-[11px] font-normal text-rose-700">Normal return path</div>
                      </div>
                    )}

                    {isEligible && (
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <div className="w-0.5 h-5 bg-slate-300" />
                        </div>

                        <div className="p-3 bg-white border border-slate-400 rounded-xl text-center text-xs font-bold text-slate-900 shadow-xs">
                          Nearby demand high?
                          <div className="text-[11px] font-normal text-slate-600 mt-0.5">
                            {isDemandHigh ? 'Yes (High pincode velocity)' : 'No (Low order frequency)'}
                          </div>
                        </div>

                        {!isDemandHigh && (
                          <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-center text-xs font-bold shadow-xs animate-in fade-in">
                            Warehouse return
                            <div className="text-[11px] font-normal text-rose-700">Safe fallback</div>
                          </div>
                        )}

                        {isDemandHigh && (
                          <div className="p-4 bg-amber-500 text-slate-950 font-bold rounded-xl text-center shadow-lg border border-amber-600 animate-in fade-in">
                            <div className="text-xs uppercase tracking-wide">Smart Cancel Path</div>
                            <div className="text-sm font-extrabold mt-0.5">
                              Hold at local hub, match nearby order, dispatch
                            </div>
                            <div className="text-[11px] font-medium text-amber-950 mt-1">
                              ✓ 0 warehouse roundtrip kilometres
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Parameter Tuning */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              Configure Decision Gate Inputs
            </h2>

            {/* Slider 1: Fulfillment Score */}
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span>Fulfillment Score:</span>
                <span className="font-mono font-bold text-slate-900">{score} / 100</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={score}
                onChange={(e) => {const value=Number(e.target.value);setScore(value);updateSelectedEvent({score:value,stage:value<=25?'Ordered':value<=50?'Packed':value<=75?'In transit':'Last mile'});}}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0 (Ordered)</span>
                <span>50 (Packed)</span>
                <span>100 (Last Mile)</span>
              </div>
            </div>

            {/* Toggle 2: Nudge Reaction */}
            <div className="space-y-2 mb-5 pt-3 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-800 block">
                Customer Reaction to Nudge:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => {setNudgeKept(true);updateSelectedEvent({customerKept:true});}}
                  disabled={isEarly}
                  className={`py-2 px-3 rounded-lg border text-center transition-colors cursor-pointer ${
                    nudgeKept
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  } ${isEarly ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  Keep my order
                </button>
                <button
                  onClick={() => {setNudgeKept(false);updateSelectedEvent({customerKept:false});}}
                  disabled={isEarly}
                  className={`py-2 px-3 rounded-lg border text-center transition-colors cursor-pointer ${
                    !nudgeKept
                      ? 'bg-slate-900 text-white font-bold border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  } ${isEarly ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  Cancel anyway
                </button>
              </div>
              {isEarly && (
                <div className="text-[11px] text-slate-400 italic">
                  *Nudge bypassed for score ≤ 50 (Early cancel stops immediately)
                </div>
              )}
            </div>

            {/* Toggle 3: Product Eligibility */}
            <div className="space-y-2 mb-5 pt-3 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-800 block">
                Product Category Eligibility:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => {setIsEligible(true);updateSelectedEvent({eligible:true});}}
                  className={`py-2 px-3 rounded-lg border text-center transition-colors cursor-pointer ${
                    isEligible
                      ? 'bg-emerald-500 text-white font-bold border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Eligible (Standard)
                </button>
                <button
                  onClick={() => {setIsEligible(false);updateSelectedEvent({eligible:false});}}
                  className={`py-2 px-3 rounded-lg border text-center transition-colors cursor-pointer ${
                    !isEligible
                      ? 'bg-rose-600 text-white font-bold border-rose-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Ineligible (Perishable)
                </button>
              </div>
            </div>

            {/* Toggle 4: Nearby Demand Density */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-800 block">
                Local Demand in Hub Pincode:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => {setIsDemandHigh(true);updateSelectedEvent({demand:85});}}
                  className={`py-2 px-3 rounded-lg border text-center transition-colors cursor-pointer ${
                    isDemandHigh
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  High Demand (≥ 75)
                </button>
                <button
                  onClick={() => {setIsDemandHigh(false);updateSelectedEvent({demand:55});}}
                  className={`py-2 px-3 rounded-lg border text-center transition-colors cursor-pointer ${
                    !isDemandHigh
                      ? 'bg-slate-800 text-white font-bold border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Low Demand (&lt; 75)
                </button>
              </div>
            </div>
          </div>

          {/* Outcome Summary Card */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-3">
            <div className="text-xs text-amber-400 font-mono uppercase tracking-wide">
              Computed System Action
            </div>
            <div className="text-base font-bold">
              {finalOutcome === 'early_stop' && 'Early Order Terminated at Zero Cost'}
              {finalOutcome === 'nudge_worked' && 'Nudge Succeeded: Parcel Stays in Delivery'}
              {finalOutcome === 'smart_rematch' && 'Held at Hub for Local Re-Match'}
              {finalOutcome === 'warehouse_fallback' && 'Standard Reverse Logistics Return'}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {finalOutcome === 'early_stop' &&
                'Because the parcel was not yet loaded for transit, cancellation was handled with zero linehaul fuel and zero packaging loss.'}
              {finalOutcome === 'nudge_worked' &&
                'The honest calculation convinced the customer to keep the shipment. Full retail revenue preserved; driver route unchanged.'}
              {finalOutcome === 'smart_rematch' &&
                'Item passed optical seal inspection and demand threshold. It is placed into a local hub rack slot for dispatch to a nearby customer.'}
              {finalOutcome === 'warehouse_fallback' &&
                'Item did not meet re-matching criteria (perishable or insufficient nearby orders). It safely follows the standard warehouse return process.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
