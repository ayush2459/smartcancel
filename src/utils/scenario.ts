import type { CancellationEvent } from '../types/operations';
import { calculateImpact } from './impact';
import { MOCK_DEMAND_ORDERS } from '../data/operationsMock';
export type ScenarioId='early'|'nearby'|'lastmile'|'nodemand'|'capacity'|'value'|'simultaneous'|'failure';
export interface ScenarioResult { scenario:ScenarioId; decision:string; simulatedEvent:CancellationEvent; impact:ReturnType<typeof calculateImpact>; }
export function evaluateScenario(scenario:ScenarioId,event:CancellationEvent,events:CancellationEvent[]):ScenarioResult {
 let sim={...event,status:'Evaluated' as CancellationEvent['status']};
 let decision='';
 if(scenario==='early'){sim={...sim,score:15,stage:'Ordered',distanceKm:0,partnerMinutes:0};decision='Stop before dispatch; no hub hold or return trip is needed.';}
 if(scenario==='nearby'){const demand=MOCK_DEMAND_ORDERS.find(o=>o.pincode===event.pincode&&o.demand>=75);sim={...sim,category:demand?.category??event.category,eligible:true,sealVerified:true,demand:90};decision=demand?'Compatible simulated order '+demand.id+' matches the pincode; eligibility, seal, and demand pass. Recommend a time-limited hold, subject to a free slot.':'No compatible simulated order at this pincode; use warehouse fallback.';if(!demand)sim.status='Fallback';}
 if(scenario==='lastmile'){sim={...sim,score:92,stage:'Last mile',partnerMinutes:36};decision='Last-mile time is committed. Check verified seal, compatibility, demand, and remaining hub capacity before holding.';}
 if(scenario==='nodemand'){sim={...sim,demand:0,status:'Fallback'};decision='No compatible demand signal. Do not hold; follow warehouse fallback.';}
 if(scenario==='capacity'){const used=Math.ceil(event.hubCapacity*.95),demand=MOCK_DEMAND_ORDERS.find(o=>o.pincode===event.pincode&&o.demand>=75);sim={...sim,category:demand?.category??event.category,sealVerified:true,eligible:true,demand:90};decision=used<event.hubCapacity&&demand?`Hub at 95% capacity (${used}/${event.hubCapacity}); a hold fits only if this remaining slot is reserved successfully.`:'Hub is full or has no compatible demand; use fallback.';if(used>=event.hubCapacity||!demand)sim.status='Fallback';}
 if(scenario==='value'){sim={...sim,valueInr:41417,eligible:true,sealVerified:true,demand:90};decision='High-value parcel (₹41,417 simulated): require operator review before any reassignment.';}
 if(scenario==='simultaneous'){const candidates=[event,{...event,id:`SIM-${event.id}`,cancelledAt:event.cancelledAt}].filter(e=>e.eligible&&e.sealVerified&&e.demand>=75).sort((a,b)=>a.cancelledAt.localeCompare(b.cancelledAt)||a.id.localeCompare(b.id));const winner=candidates[0];sim={...sim,hubCapacity:1,eligible:true,sealVerified:true,demand:90,status:winner?.id===event.id?'Evaluated':'Fallback'};decision=`One-slot deterministic allocation: ${winner?.id??'none'} receives priority by cancellation time and stable event ID; the competing parcel falls back.`;}
 if(scenario==='failure'){sim={...sim,eligible:false,status:'Fallback'};decision='Selected hub is unavailable. Do not reserve inventory; use the warehouse fallback.';}
 return {scenario,decision,simulatedEvent:sim,impact:calculateImpact(sim)};
}
