import type { CancellationEvent } from '../types/operations';
import { INITIAL_HUB_SLOTS } from '../data/mockData';
import { MOCK_DEMAND_ORDERS, type MockDemandOrder } from '../data/operationsMock';
export const getCompatibleMockOrders=(event:CancellationEvent):MockDemandOrder[]=>MOCK_DEMAND_ORDERS.filter(order=>order.pincode===event.pincode&&order.demand>=75&&event.category.toLowerCase().split(/[^a-z0-9]+/).some(word=>word.length>3&&order.category.toLowerCase().includes(word)));
export const isRecoveryEligible=(event:CancellationEvent)=>event.eligible&&event.sealVerified&&event.score>25&&!event.customerKept&&event.demand>=75&&getCompatibleMockOrders(event).length>0&&event.status!=='Fallback'&&event.status!=='Rejected';
export function canPlaceOnHold(event:CancellationEvent,events:CancellationEvent[]){
 const held=events.filter(e=>e.id!==event.id&&e.hub===event.hub&&(e.status==='On hold')).length;
 const available=held<event.hubCapacity;
 const freeRackSlots=INITIAL_HUB_SLOTS.filter(slot=>slot.pincode===event.pincode&&!slot.isOccupied).length;
 const heldRackParcels=events.filter(e=>e.id!==event.id&&e.pincode===event.pincode&&e.status==='On hold').length;
 const reasons:string[]=[];
 if(!event.eligible)reasons.push('item is not eligible');
 if(!event.sealVerified)reasons.push('seal is not verified');
 if(event.score<=25)reasons.push('early cancellation bypasses hub hold');
 if(event.demand<75)reasons.push('demand is below 75/100');
 if(getCompatibleMockOrders(event).length===0)reasons.push('no compatible demand order is available');
 if(event.customerKept)reasons.push('customer kept the order');
 if(!available)reasons.push('hub is at capacity');
 if(freeRackSlots<=heldRackParcels)reasons.push('no free parcel rack at this pincode');
 return {allowed:reasons.length===0,held,capacity:event.hubCapacity,availableSlots:Math.min(Math.max(0,event.hubCapacity-held),Math.max(0,freeRackSlots-heldRackParcels)),reasons};
}
export function canMatchHeldParcel(event:CancellationEvent){return event.status==='On hold'&&isRecoveryEligible(event)&&event.holdHours>0;}
