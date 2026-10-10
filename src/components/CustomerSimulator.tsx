import React, { useEffect, useState } from 'react';
import { DemoProduct, FulfillmentStageId } from '../types/smartCancel';
import { DEMO_PRODUCTS, FULFILLMENT_STAGES } from '../data/mockData';
import { Check, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { calculateImpact } from '../utils/impact';
import { useOperations } from '../context/OperationsContext';
import { canPlaceOnHold, getCompatibleMockOrders } from '../utils/hubConstraints';
import { formatINR } from '../utils/locale';

interface CustomerSimulatorProps {
  onCancelComplete?: (data: {
    product: DemoProduct;
    stage: FulfillmentStageId;
    nudgeAction: 'keep' | 'cancel';
    matched: boolean;
  }) => void;
}

export const CustomerSimulator: React.FC<CustomerSimulatorProps> = ({
  onCancelComplete,
}) => {
  const { selectedEvent, events, updateSelectedEvent } = useOperations();
  const [selectedProduct, setSelectedProduct] = useState<DemoProduct>(DEMO_PRODUCTS[0]);
  const [selectedStage, setSelectedStage] = useState<FulfillmentStageId>('last_mile');
  const [currentScreen, setCurrentScreen] = useState<'tracker' | 'impact_card' | 'confirmation' | 'order_kept'>('tracker');
  const [isMatching, setIsMatching] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  useEffect(() => {
    if (!selectedEvent) return;
    const product = DEMO_PRODUCTS.find((item) => selectedEvent.product.toLowerCase().includes(item.name.split(' ')[0].toLowerCase()));
    if (product) setSelectedProduct(product);
    const stage = selectedEvent.score <= 25 ? 'ordered' : selectedEvent.score <= 50 ? 'packed' : selectedEvent.score <= 75 ? 'in_transit' : 'last_mile';
    setSelectedStage(stage);
    setCurrentScreen('tracker');
    setMatchFound(false);
    setIsMatching(false);
  }, [selectedEvent?.id]);

  // Dynamic calculations based on stage & product
  const stageIndex = FULFILLMENT_STAGES.findIndex((s) => s.id === selectedStage);
  const currentStageObj = FULFILLMENT_STAGES[stageIndex];

  // Distances and CO2 calculate dynamically from stage & weight
  const extraDistance =
    selectedStage === 'ordered'
      ? 0
      : selectedStage === 'packed'
      ? 1.5
      : selectedStage === 'in_transit'
      ? Math.round(selectedProduct.extraDistanceKm * 0.6 * 10) / 10
      : selectedProduct.extraDistanceKm;

  const co2Extra =
    selectedStage === 'ordered'
      ? 0
      : selectedStage === 'packed'
      ? 0.05
      : selectedStage === 'in_transit'
      ? Math.round(selectedProduct.co2SavedKg * 0.6 * 100) / 100
      : selectedProduct.co2SavedKg;

  const customerImpact = selectedEvent ? calculateImpact({
    ...selectedEvent,
    distanceKm: extraDistance,
    score: currentStageObj.defaultScore,
    partnerMinutes: selectedStage === 'last_mile' ? 24 : selectedStage === 'in_transit' ? 12 : 0,
    conventionalCostInr: selectedStage === 'ordered' ? 33 : selectedStage === 'packed' ? 183 : selectedStage === 'in_transit' ? 481 : 697,
    smartCostInr: selectedStage === 'ordered' ? 33 : 257,
    eligible: selectedProduct.isEligible && selectedStage !== 'ordered' && selectedEvent.eligible,
    status: 'Evaluated',
  }) : null;
  const taglines = selectedStage === 'ordered'
    ? ['Plot twist: your parcel might still have a second destination. 👀', 'Your plans changed. Can your parcel have a plan B?']
    : selectedStage === 'packed'
    ? ['Your parcel is ready for a career change. Maybe another doorstep?', 'Before this parcel takes the scenic route back, let’s check its options. 🚚']
    : selectedProduct.isEligible
    ? ['One cancellation, potentially fewer kilometres. The planet appreciates the plot twist. 🌱', 'Plot twist: your parcel might still have a second destination. 👀']
    : ['Your plans changed. We’ll check the safe return route for your parcel.', 'Before this parcel takes the scenic route back, let’s check its options. 🚚'];
  const tagline = taglines[selectedProduct.id.length % taglines.length];

  const getStageMessage = () => {
    switch (selectedStage) {
      case 'ordered':
        return 'Order placed. Easy to cancel right now before packing.';
      case 'packed':
        return 'Packed in box. Cancelling now means restocking the packaged parcel.';
      case 'in_transit':
        return 'In transit to local hub. Cancelling now means reversing linehaul freight.';
      case 'last_mile':
      default:
        return 'Out for delivery. Cancelling now means extra travel for this parcel.';
    }
  };

  const handleStartCancel = () => {
    // If ordered (Level 1), cancel stops immediately without nudge as per flowchart Figure 2
    if (selectedStage === 'ordered') {
      setCurrentScreen('confirmation');
      setMatchFound(false);
      return;
    }
    // Otherwise show impact card (Layer 1)
    setCurrentScreen('impact_card');
  };

  const handleKeepOrder = () => {
    updateSelectedEvent({customerKept:true});
    setCurrentScreen('order_kept');
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#F59E0B', '#10B981', '#3B82F6'],
    });
    if (onCancelComplete) {
      onCancelComplete({
        product: selectedProduct,
        stage: selectedStage,
        nudgeAction: 'keep',
        matched: false,
      });
    }
  };

  const handleCancelAnyway = () => {
    updateSelectedEvent({customerKept:false});
    setCurrentScreen('confirmation');
    setIsMatching(true);

    // If product is eligible, simulate finding a local match
    const canMatch = selectedStage !== 'ordered' && selectedProduct.isEligible && Boolean(selectedEvent && getCompatibleMockOrders(selectedEvent).length>0 && canPlaceOnHold(selectedEvent,events).allowed);
    if (canMatch) {
      setTimeout(() => {
        setIsMatching(false);
        setMatchFound(true);
      }, 1600);
    } else {
      setTimeout(() => {
        setIsMatching(false);
        setMatchFound(false);
      }, 1200);
    }

    const complete = (matched:boolean) => onCancelComplete?.({product:selectedProduct,stage:selectedStage,nudgeAction:'cancel',matched});
    if (!canMatch) setTimeout(() => complete(false), 1200);
    else setTimeout(() => complete(true), 1600);
  };

  const handleResetToTracker = () => {
    setCurrentScreen('tracker');
    setIsMatching(false);
    setMatchFound(false);
  };

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Editorial Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span>SmartCancy India Prototype</span>
          <span aria-hidden="true">·</span>
          <span>Section 5</span>
          <span aria-hidden="true">·</span>
          <span>Customer Experience</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          What the customer sees (UI design)
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Three prototype screens built strictly around customer trust: zero dark patterns, no guilt wording, equal button sizes, and transparent logistics calculations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Interactive Scenario Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Product Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Select Demo Order
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Test how different product categories and eligibility rules respond to cancellation.
            </p>

            <div className="space-y-2">
              {DEMO_PRODUCTS.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => {
                    setSelectedProduct(prod);
                    updateSelectedEvent({product:prod.name,category:prod.category,pincode:prod.hubPincode,eligible:prod.isEligible,distanceKm:prod.extraDistanceKm,demand:prod.demandRate==='high'?88:prod.demandRate==='medium'?65:35});
                    handleResetToTracker();
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                    selectedProduct.id === prod.id
                      ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{prod.imageEmoji}</span>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{prod.name}</div>
                      <div className="text-xs text-slate-500">
                        {prod.category} · {formatINR(prod.price)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                        prod.isEligible
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {prod.isEligible ? 'Eligible' : 'Not Eligible'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Fulfillment Stage Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-900">
                Fulfillment Stage & Irreversibility
              </h2>
              <span className="text-xs font-mono font-medium text-slate-500">
                Score: {currentStageObj.defaultScore}/100
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Move the parcel through the fulfillment pipeline to see score changes.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {FULFILLMENT_STAGES.map((stg) => (
                <button
                  key={stg.id}
                  onClick={() => {
                    setSelectedStage(stg.id);
                    updateSelectedEvent({score:stg.defaultScore,stage:stg.name.replace(/^Level \d: /,''),distanceKm:stg.id==='ordered'?0:stg.id==='packed'?1.5:stg.id==='in_transit'?selectedProduct.extraDistanceKm*.6:selectedProduct.extraDistanceKm});
                    handleResetToTracker();
                  }}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    selectedStage === stg.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-semibold">{stg.name}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      selectedStage === stg.id ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Score {stg.scoreRange}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>{currentStageObj.costImpact}</span>
            </div>
          </div>

          {/* Quick Flow Presets */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-900 mb-2">
              UI Rules Followed (Amazon Hackathon Constitution)
            </h2>
            <ul className="text-xs text-slate-600 space-y-2">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span><strong>Cancel is always 1 tap away:</strong> Cancel button remains same size as Keep my order.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span><strong>Only real numbers:</strong> Calculated dynamically from route data; estimates labelled clearly.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span><strong>No guilt or penalties:</strong> Zero countdown timers, no punitive copy, no dark patterns.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span><strong>Savings shown only when real:</strong> The green confirmation summary appears only when a local match is found.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: High-Fidelity Mobile App Simulator */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {/* Phone Frame Device Wrapper */}
          <div className="w-full max-w-[390px] bg-slate-900 p-3 rounded-[40px] shadow-2xl ring-1 ring-slate-800">
            {/* Phone Screen Bezels */}
            <div className="bg-white rounded-[32px] overflow-hidden min-h-[660px] flex flex-col justify-between border border-slate-100 relative">
              {/* Phone Status Bar */}
              <div className="px-6 pt-3 pb-2 flex items-center justify-between text-xs font-semibold text-slate-800 select-none">
                <span>9:41 IST</span>
                <div className="w-20 h-4 bg-slate-900 rounded-full mx-auto" />
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Dynamic Screen Content */}
              <div className="flex-1 p-5 flex flex-col justify-between">
                {/* ==================================================== */}
                {/* SCREEN 1: ORDER TRACKER (Figure 4, Mock 1)           */}
                {/* ==================================================== */}
                {currentScreen === 'tracker' && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    {/* Header */}
                    <div className="border-b border-slate-100 pb-2">
                      <h3 className="text-base font-bold text-slate-900">Your Orders</h3>
                    </div>

                    {/* Order Item Card */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-3">
                      <div className="w-14 h-14 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-3xl shadow-xs shrink-0">
                        {selectedProduct.imageEmoji}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {selectedProduct.name}
                        </h4>
                        <p className="text-xs text-emerald-700 font-medium">
                          {selectedProduct.deliveryTimeText}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Qty: 1 · Total: {formatINR(selectedProduct.price)}
                        </p>
                      </div>
                    </div>

                    {/* "How easy is it to cancel?" Meter */}
                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-800">
                        <span>How easy is it to cancel?</span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {currentStageObj.defaultScore}/100
                        </span>
                      </div>

                      {/* 4-Stage Step Bar (Plain words: Ordered, Packed, Transit, Last mile) */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {FULFILLMENT_STAGES.map((stg, idx) => {
                          const isActive = idx <= stageIndex;
                          const isCurrent = idx === stageIndex;
                          return (
                            <div key={stg.id} className="space-y-1">
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  isActive
                                    ? isCurrent
                                      ? 'bg-amber-500 ring-2 ring-amber-300'
                                      : 'bg-emerald-500'
                                    : 'bg-slate-200'
                                }`}
                              />
                              <span
                                className={`block text-[10px] text-center leading-tight truncate ${
                                  isCurrent
                                    ? 'font-bold text-slate-900'
                                    : isActive
                                    ? 'text-slate-700'
                                    : 'text-slate-400'
                                }`}
                              >
                                {stg.id === 'ordered' && 'Ordered'}
                                {stg.id === 'packed' && 'Packed'}
                                {stg.id === 'in_transit' && 'Transit'}
                                {stg.id === 'last_mile' && 'Last mile'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {getStageMessage()}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2.5 pt-2">
                      <button
                        onClick={() => setTrackingModalOpen(true)}
                        className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Track package
                      </button>

                      <button
                        onClick={handleStartCancel}
                        className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-medium text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel order
                      </button>
                    </div>

                    <div className="text-center">
                      <span className="text-[11px] text-slate-400">
                        Cancel is always one tap away
                      </span>
                    </div>
                  </div>
                )}

                {/* ==================================================== */}
                {/* SCREEN 2: BEFORE YOU CANCEL (Figure 4, Mock 2)       */}
                {/* ==================================================== */}
                {currentScreen === 'impact_card' && (
                  <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Header */}
                      <div className="border-b border-slate-100 pb-2 mb-4 flex items-center justify-between">
                        <h3 className="text-base font-bold text-slate-900">Cancel order</h3>
                        <span className="text-[11px] text-slate-400">Layer 1 Nudge</span>
                      </div>

                      <div className="space-y-3">
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5">
                          <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                            Before you cancel
                          </h4>
                          <p className="text-xs text-amber-900 mt-0.5">{tagline}</p>
                          <p className="text-[10px] text-amber-800 mt-1">Estimates only. Recovery remains potential until a compatible match is confirmed. You can cancel now or go back.</p>
                        </div>

                        {customerImpact ? <div className="grid grid-cols-2 gap-2">{([['CO₂e','co2Kg','kg'],['Fuel','fuelL','L'],['Distance','distanceKm','km'],['Partner time','partnerMinutes','min'],['Operational cost','costInr','INR']] as const).map(([label,key,unit])=><div key={key} className="rounded-lg border border-slate-200 bg-white p-2"><div className="text-[10px] font-semibold text-slate-700">{label}</div><div className="grid grid-cols-2 gap-1 mt-1 text-[9px]"><div><span className="text-slate-400 block">Conventional est.</span><b>{key==='costInr'?formatINR(customerImpact.conventional[key]):`${customerImpact.conventional[key].toFixed(1)} ${unit}`}</b></div><div><span className="text-emerald-700 block">Recovery est.</span><b>{key==='costInr'?formatINR(customerImpact.smart[key]):`${customerImpact.smart[key].toFixed(1)} ${unit}`}</b></div></div><div className="grid grid-cols-2 gap-1 mt-1"><div className="h-1.5 bg-slate-200 rounded"/><div className="h-1.5 bg-emerald-100 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{width:`${customerImpact.conventional[key] ? Math.min(100,customerImpact.smart[key]/customerImpact.conventional[key]*100) : 0}%`}}/></div></div><div className="text-[9px] text-slate-500 mt-1">Potential difference: {key==='costInr'?formatINR(customerImpact.savings[key]):`${customerImpact.savings[key].toFixed(1)} ${unit}`}</div></div>)}</div> : <div className="border rounded-lg p-3 text-xs text-slate-500">Estimate unavailable: no route or operating inputs are available.</div>}
                        <p className="text-[10px] text-slate-500">Illustrative estimates use shared fleet factors; no savings are confirmed here. Packaging: {selectedProduct.packagingDescription}</p>
                      </div>
                    </div>

                    {/* Equal-sized Buttons (Page 5 rule) */}
                    <div className="space-y-2.5 pt-4">
                      <button
                        onClick={() => setCurrentScreen('tracker')}
                        className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold text-sm rounded-lg transition-colors cursor-pointer"
                      >
                        Go back
                      </button>
                      <button
                        onClick={handleKeepOrder}
                        className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Keep my order
                      </button>

                      <button
                        onClick={handleCancelAnyway}
                        className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-lg transition-colors cursor-pointer"
                      >
                        Confirm cancellation
                      </button>

                      <p className="text-[11px] text-slate-400 text-center">
                        Both buttons same size · No penalty · Full refund
                      </p>
                    </div>
                  </div>
                )}

                {/* ==================================================== */}
                {/* SCREEN 3: AFTER CANCELLING (Figure 4, Mock 3)         */}
                {/* ==================================================== */}
                {currentScreen === 'confirmation' && (
                  <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Header */}
                      <div className="border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-base font-bold text-slate-900">Order cancelled</h3>
                      </div>

                      {/* Green Checkmark OK Icon */}
                      <div className="text-center py-2">
                        <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto text-xl font-bold shadow-sm">
                          OK
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-2">
                          Your order is cancelled
                        </h4>
                        <p className="text-xs text-slate-500">
                          Refund has started to your original payment method.
                        </p>
                      </div>

                      {/* Smart Cancel Layer 2 Status Card */}
                      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-slate-900">
                            Your parcel may find a new owner
                          </h5>
                          {isMatching && (
                            <span className="text-[10px] text-amber-600 animate-pulse">
                              Matching...
                            </span>
                          )}
                        </div>

                        {/* Progress checklist */}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2 text-slate-700">
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                              ✓
                            </span>
                            <span>{matchFound ? `Held and matched in simulation (${selectedProduct.hubPincode})` : isMatching ? `Checking hub eligibility at ${selectedProduct.hubPincode}` : `Hub recovery is not confirmed (${selectedProduct.hubPincode})`}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {matchFound ? (
                              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                                ✓
                              </span>
                            ) : isMatching ? (
                              <span className="w-4 h-4 rounded-full border border-amber-500 border-t-transparent animate-spin" />
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">
                                •
                              </span>
                            )}
                            <span className={matchFound ? 'text-slate-700 font-medium' : 'text-slate-500'}>
                              {matchFound ? 'Compatible match confirmed in simulation' : isMatching ? 'Checking compatible nearby demand…' : selectedProduct.isEligible ? 'No confirmed match; standard return remains available' : 'Ineligible for local match'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {matchFound ? (
                              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                                ✓
                              </span>
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">
                                •
                              </span>
                            )}
                            <span className={matchFound ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                              {matchFound ? `Potential return travel reduction (about ${extraDistance} km)` : 'Potential savings are not confirmed'}
                            </span>
                          </div>
                        </div>

                        {/* Conditional Green Summary (UI rule: Savings shown only if a match is found) */}
                        {matchFound && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 animate-in fade-in">
                            <span className="font-bold">Simulated impact estimate:</span> A compatible match may avoid about{' '}
                            <strong>{extraDistance} km</strong> and <strong>{co2Extra} kg CO₂</strong>!
                          </div>
                        )}

                        {!selectedProduct.isEligible && (
                          <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600">
                            Item routed through standard warehouse return: {selectedProduct.ineligibilityReason}
                          </div>
                        )}
                      </div>

                      <div className="text-center mt-2">
                        <span className="text-[10px] text-slate-400">
                          Potential estimates only; not measured savings
                        </span>
                      </div>
                    </div>

                    {/* Back to Orders Button */}
                    <div className="pt-3">
                      <button
                        onClick={handleResetToTracker}
                        className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Back to orders
                      </button>
                    </div>
                  </div>
                )}

                {/* ==================================================== */}
                {/* SCREEN 4: ORDER KEPT (Nudge worked successfully)      */}
                {/* ==================================================== */}
                {currentScreen === 'order_kept' && (
                  <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="border-b border-slate-100 pb-2 mb-3">
                        <h3 className="text-base font-bold text-slate-900">Order continues</h3>
                      </div>

                      <div className="text-center py-6">
                        <div className="w-14 h-14 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center mx-auto text-xl font-bold shadow-sm">
                          <Check className="w-7 h-7" />
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-3">
                          Thank you for keeping your order!
                        </h4>
                        <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                          Your driver is still on track for delivery today. You avoided {extraDistance} km of unnecessary reverse travel.
                        </p>
                      </div>

                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>🌱</span>
                          <span>Environmental Impact Preserved</span>
                        </div>
                        <p className="text-[11px] text-emerald-700">
                          No packaging wasted. Delivery van remains on optimal route.
                        </p>
                      </div>
                    </div>

                    <div className="pt-3">
                      <button
                        onClick={handleResetToTracker}
                        className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Back to order details
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Home Indicator */}
              <div className="pb-2 pt-1 flex justify-center">
                <div className="w-32 h-1 bg-slate-300 rounded-full" />
              </div>
            </div>
          </div>

          {/* Screen Navigation Helper for Judges / Reviewers */}
          <div className="mt-4 flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 px-2 font-medium">Screens:</span>
            <button
              onClick={() => setCurrentScreen('tracker')}
              className={`px-2.5 py-1 rounded cursor-pointer ${
                currentScreen === 'tracker' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Tracker
            </button>
            <button
              onClick={() => setCurrentScreen('impact_card')}
              className={`px-2.5 py-1 rounded cursor-pointer ${
                currentScreen === 'impact_card' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Impact Nudge
            </button>
            <button
              onClick={() => {
                setCurrentScreen('confirmation');
                setMatchFound(true);
              }}
              className={`px-2.5 py-1 rounded cursor-pointer ${
                currentScreen === 'confirmation' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Confirmation
            </button>
          </div>
        </div>
      </div>

      {/* Package Tracking Map Modal simulation */}
      {trackingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Live Package Route</h3>
              <button
                onClick={() => setTrackingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="h-44 bg-slate-100 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-200">
                {/* Stylized vector map */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:16px_16px]" />
                <div className="relative text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center font-bold mx-auto mb-2 shadow-md">
                    🚐
                  </div>
                  <div className="text-xs font-semibold text-slate-800">
                    Delivery Partner Van · Driver nearby
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Pincode {selectedProduct.hubPincode} · 4 stops away
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Current stage: <strong>{currentStageObj.name}</strong>. If cancelled now, the driver would need to hold and return the parcel to the station.
              </p>
              <button
                onClick={() => setTrackingModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 text-white font-medium text-xs rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Close Tracking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
