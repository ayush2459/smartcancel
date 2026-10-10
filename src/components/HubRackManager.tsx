import React, { useState, useEffect } from 'react';
import { HubSlot } from '../types/smartCancel';
import { INITIAL_HUB_SLOTS, ELIGIBILITY_RULES } from '../data/mockData';
import { Clock, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, Package, Printer, Sparkles } from 'lucide-react';
import { useOperations } from '../context/OperationsContext';
import { getCompatibleMockOrders } from '../utils/hubConstraints';

export const HubRackManager: React.FC = () => {
  const { selectedEvent, updateStatus } = useOperations();
  const [slots, setSlots] = useState<HubSlot[]>(INITIAL_HUB_SLOTS);
  const [activeSlotId, setActiveSlotId] = useState<string>('slot-1');
  const [lastDispatchedInfo, setLastDispatchedInfo] = useState<string | null>(null);

  // Active slot details
  const activeSlot = slots.find((s) => s.id === activeSlotId) || slots[0];

  useEffect(() => {
    if (!selectedEvent) return;
    if (selectedEvent.status === 'On hold') {
      setSlots(prev => {
        if (prev.some(slot => slot.parcelId === selectedEvent.parcelId)) return prev;
        const free = prev.find(slot => !slot.isOccupied && slot.pincode === selectedEvent.pincode);
        if (!free) return prev;
        return prev.map(slot => slot.id === free.id ? {...slot, parcelId:selectedEvent.parcelId, productName:selectedEvent.product, category:selectedEvent.category, pincode:selectedEvent.pincode, sealVerified:selectedEvent.sealVerified, sealPhotoStatus:selectedEvent.sealVerified?'verified':'flagged', holdHoursRemaining:selectedEvent.holdHours, demandScore:selectedEvent.demand, isOccupied:true, isDispatched:false} : slot);
      });
    } else if (['Matched','Executed','Fallback','Rejected'].includes(selectedEvent.status)) {
      setSlots(prev => {
        if ((selectedEvent.status==='Matched'||selectedEvent.status==='Executed') && !prev.some(slot=>slot.parcelId===selectedEvent.parcelId)) {
          const free=prev.find(slot=>!slot.isOccupied&&slot.pincode===selectedEvent.pincode);
          if(free)return prev.map(slot=>slot.id===free.id?{...slot,parcelId:selectedEvent.parcelId,productName:selectedEvent.product,category:selectedEvent.category,pincode:selectedEvent.pincode,sealVerified:selectedEvent.sealVerified,sealPhotoStatus:selectedEvent.sealVerified?'verified':'flagged',holdHoursRemaining:0,demandScore:selectedEvent.demand,isOccupied:false,isDispatched:true,matchedOrderId:selectedEvent.matchedOrderId}:slot);
        }
        return prev.map(slot => slot.parcelId === selectedEvent.parcelId ? {...slot, isOccupied:false, isDispatched:selectedEvent.status==='Matched'||selectedEvent.status==='Executed', matchedOrderId:selectedEvent.status==='Matched'||selectedEvent.status==='Executed'?(selectedEvent.matchedOrderId||slot.matchedOrderId):undefined} : slot);
      });
    }
  }, [selectedEvent?.id, selectedEvent?.status]);

  // Tick down hold timers every few seconds to demonstrate Redis TTL behavior
  useEffect(() => {
    const timer = setInterval(() => {
      setSlots((prev) =>
        prev.map((slot) => {
          if (slot.isOccupied && slot.holdHoursRemaining > 0) {
            return {
              ...slot,
              holdHoursRemaining: Math.max(0, slot.holdHoursRemaining - 0.05),
            };
          }
          return slot;
        })
      );
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleSimulateIncomingOrder = () => {
    if (!selectedEvent || selectedEvent.status !== 'On hold') {
      setLastDispatchedInfo('Simulation unavailable: approve and place the selected event on hub hold before matching.');
      return;
    }
    // Find the occupied slot with highest demand score
    const occupiedSlots = slots.filter((s) => s.parcelId === selectedEvent.parcelId && s.pincode === selectedEvent.pincode && s.isOccupied && s.sealVerified && s.sealPhotoStatus === 'verified' && s.holdHoursRemaining > 0 && s.demandScore >= 75);
    if (occupiedSlots.length === 0) {
      alert('All slots are currently empty or waiting for new held parcels.');
      return;
    }

    const matched = occupiedSlots.sort((a, b) => b.demandScore - a.demandScore || a.id.localeCompare(b.id))[0];
    const compatibleOrder = getCompatibleMockOrders(selectedEvent)[0];
    if (!compatibleOrder) {
      setLastDispatchedInfo('No compatible mock demand order exists for this parcel and pincode. It remains on hold until fallback or expiry.');
      return;
    }
    const newOrderId = compatibleOrder.id;

    setLastDispatchedInfo(
      `SIMULATION ONLY: Parcel ${matched.parcelId} (${matched.productName}) allocated to compatible order #${newOrderId} in pincode ${matched.pincode}. This is not a confirmed dispatch.`
    );
    void updateStatus('Matched', 'AI-ASSISTED');

    // Free the slot after a brief dispatch animation
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id === matched.id) {
          return {
            ...s,
            isOccupied: false,
            matchedOrderId: newOrderId,
            isDispatched: true,
          };
        }
        return s;
      })
    );
  };

  const handleResetSlots = () => {
    setSlots(INITIAL_HUB_SLOTS);
    setLastDispatchedInfo(null);
  };

  const handleToggleSealCheck = (slotId: string) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id === slotId) {
          const nextStatus = s.sealVerified ? false : true;
          return {
            ...s,
            sealVerified: nextStatus,
            sealPhotoStatus: nextStatus ? 'verified' : 'flagged',
          };
        }
        return s;
      })
    );
  };

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Amazon Hackathon Idea Document</span>
            <span aria-hidden="true">·</span>
            <span>Figure 5 & Section 6</span>
            <span aria-hidden="true">·</span>
            <span>Local Station Operations</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Inside the local hub: held parcels wait for a match
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Holding costs hub space, so we hold only when the demand score is high. Each held parcel has a 3-point check: optical seal verification, Redis TTL hold timer, and real-time pincode demand scoring.
          </p>
          <p className="text-[10px] font-semibold text-amber-800 mt-2">DETERMINISTIC MOCK INVENTORY · Selected event parcels appear here only while their shared status is On hold.</p>
        </div>

        {/* Dispatch Simulator Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateIncomingOrder}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Simulate Incoming Order</span>
          </button>
          <button
            onClick={handleResetSlots}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors border border-slate-200 cursor-pointer"
          >
            Reset Hub Slots
          </button>
        </div>
      </div>

      {/* Dispatch Banner if triggered */}
      {lastDispatchedInfo && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-start gap-3 text-emerald-900 text-xs animate-in fade-in">
          <Printer className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Simulated allocation (not a confirmed dispatch):</span>{' '}
            {lastDispatchedInfo}
          </div>
          <button
            onClick={() => setLastDispatchedInfo(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Rack View & Slot Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Hub Shelf Racks Isometric Visualization (Figure 5) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Noida Hub #NDH1 Holding Grid
              </h2>
              <p className="text-xs text-slate-500">
                Pincode 201301 · Max Capacity: 6 Staging Racks
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                <span className="w-3 h-3 rounded bg-amber-400 border border-amber-500" />
                Held (Demand High)
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300" />
                Free Slot
              </span>
            </div>
          </div>

          {/* Isometric Hub Rack Grid matching Figure 5 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {slots.map((slot) => {
              const isSelected = activeSlotId === slot.id;
              return (
                <div
                  key={slot.id}
                  onClick={() => setActiveSlotId(slot.id)}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative ${
                    isSelected
                      ? 'ring-2 ring-amber-400 border-amber-500 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  } ${
                    slot.isOccupied
                      ? 'bg-amber-50/60'
                      : 'bg-slate-50/70 border-dashed border-slate-300'
                  }`}
                >
                  {/* Slot Code Header */}
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-mono font-bold text-slate-700">
                      {slot.slotCode}
                    </span>
                    {slot.isOccupied ? (
                      <span className="text-[10px] font-bold text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded">
                        Held
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">
                        Empty
                      </span>
                    )}
                  </div>

                  {slot.isOccupied ? (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-900 line-clamp-1">
                        {slot.productName}
                      </div>

                      {/* Demand Score Meter */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-600 font-medium">
                          <span>Demand Score</span>
                          <span className="font-mono font-bold text-amber-700">
                            {slot.demandScore}/100
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${slot.demandScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Hold Timer */}
                      <div className="flex items-center gap-1 text-[11px] font-mono text-slate-600">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{slot.holdHoursRemaining.toFixed(1)}h remaining</span>
                      </div>

                      {/* Seal status badge */}
                      <div className="pt-1 flex items-center gap-1 text-[10px]">
                        {slot.sealVerified ? (
                          <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                            <ShieldCheck className="w-3 h-3" /> Seal Intact (Photo OK)
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center gap-1 font-semibold">
                            <AlertTriangle className="w-3 h-3" /> Seal Flagged
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 space-y-1">
                      <Package className="w-6 h-6 mx-auto stroke-slate-300" />
                      <div className="text-[11px]">Free Staging Slot</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Holding TTL: 72 hours max (Managed via Redis key expiry)</span>
            <span>Fallback: Automatic linehaul consolidation to FC #DEL1</span>
          </div>
        </div>

        {/* Right: Slot Inspector & Demand Score Calculator */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-4">
              <h2 className="text-sm font-bold text-slate-900">
                Slot Inspector: {activeSlot.slotCode}
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {activeSlot.parcelId || 'VACANT'}
              </span>
            </div>

            {activeSlot.isOccupied ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-slate-500">Held Package</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {activeSlot.productName}
                  </div>
                  <div className="text-xs text-slate-600">
                    Category: {activeSlot.category} · Target Hub Pincode: {activeSlot.pincode}
                  </div>
                </div>

                {/* 3 Verification Checks */}
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                  {/* 1. Seal Check */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        1. Seal Check (Scan + Photo)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        AI optical inspection of box tape and tamper seal
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleSealCheck(activeSlot.id)}
                      className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer ${
                        activeSlot.sealVerified
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {activeSlot.sealVerified ? 'Verified' : 'Flagged'}
                    </button>
                  </div>

                  {/* 2. Redis Hold Timer */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        2. Hold Timer (Redis Key TTL)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Strict 72-hour hard limit to prevent rack congestion
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-900">
                      {activeSlot.holdHoursRemaining.toFixed(1)} / 72 hrs
                    </span>
                  </div>

                  {/* 3. Demand Score Breakdown */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-900">
                        3. Real-Time Demand Score
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-700">
                        {activeSlot.demandScore} / 100
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                      <div className="p-2 bg-white rounded border border-slate-200">
                        <span className="text-slate-400 block">Mock orders (last 30d):</span>
                        <span className="font-semibold text-slate-900">48 orders</span>
                      </div>
                      <div className="p-2 bg-white rounded border border-slate-200">
                        <span className="text-slate-400 block">Mock cart / wishlist:</span>
                        <span className="font-semibold text-slate-900">126 users</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSimulateIncomingOrder}
                    className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-2"
                  >
                    <span>Match with Next Incoming Order</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <Package className="w-8 h-8 mx-auto stroke-slate-300" />
                <div className="text-xs font-medium text-slate-600">
                  This rack slot is currently empty
                </div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  When a late cancellation occurs for an eligible high-demand item, it will be placed here.
                </p>
              </div>
            )}
          </div>

          {/* Eligibility Rules Checklist (Section 6 Table) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Product Eligibility Matrix (Section 6)
            </h2>

            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Eligible for Hub Holding:
                </span>
                <ul className="text-xs text-slate-600 space-y-1 pl-3.5">
                  {ELIGIBILITY_RULES.eligible.map((item, i) => (
                    <li key={i} className="list-disc">
                      <strong>{item.title}:</strong> {item.detail}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Strictly Not Eligible (Immediate Return):
                </span>
                <ul className="text-xs text-slate-600 space-y-1 pl-3.5">
                  {ELIGIBILITY_RULES.notEligible.map((item, i) => (
                    <li key={i} className="list-disc">
                      <strong>{item.title}:</strong> {item.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
