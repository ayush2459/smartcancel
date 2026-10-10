import type { CancellationEvent } from '../types/operations';
export const MOCK_EVENTS: CancellationEvent[] = [
 {id:'CE-1042',orderId:'ORD-IN-77108',parcelId:'PCL-88401',product:'Wireless Earbuds with ANC',category:'Electronics',valueInr:4149,stage:'In transit',score:68,pincode:'201301',distanceKm:12.4,demand:92,eligible:true,sealVerified:true,status:'Evaluated',cancelledAt:'10/10/2026 09:42 IST',holdHours:72,hub:'Noida Hub',hubCapacity:72,customerKept:false,partnerMinutes:24,conventionalCostInr:697,smartCostInr:257},
 {id:'CE-1041',orderId:'ORD-IN-77094',parcelId:'PCL-91024',product:'E-reader',category:'Books & electronics',valueInr:11619,stage:'Last mile',score:88,pincode:'201301',distanceKm:18.2,demand:88,eligible:true,sealVerified:true,status:'Matched',cancelledAt:'10/10/2026 09:18 IST',holdHours:42,hub:'Noida Hub',hubCapacity:72,customerKept:false,partnerMinutes:36,conventionalCostInr:930,smartCostInr:349,matchedOrderId:'SIM-ORD-IN-201301-01'},
 {id:'CE-1040',orderId:'ORD-IN-77061',parcelId:'PCL-33108',product:'Fresh Guava',category:'Perishable',valueInr:746,stage:'Packed',score:42,pincode:'110001',distanceKm:11.2,demand:78,eligible:false,sealVerified:true,status:'Fallback',cancelledAt:'10/10/2026 08:57 IST',holdHours:0,hub:'Delhi Central Hub',hubCapacity:48,customerKept:false,partnerMinutes:0,conventionalCostInr:183,smartCostInr:183},
 {id:'CE-1039',orderId:'ORD-IN-77012',parcelId:'PCL-55092',product:'Stainless Steel Water Bottle',category:'Household',valueInr:2449,stage:'Ordered',score:16,pincode:'122001',distanceKm:9.8,demand:76,eligible:true,sealVerified:true,status:'Executed',cancelledAt:'10/10/2026 08:31 IST',holdHours:0,hub:'Gurugram Hub',hubCapacity:36,customerKept:false,partnerMinutes:0,conventionalCostInr:33,smartCostInr:33},
];
export interface MockDemandOrder { id:string; pincode:string; category:string; product:string; demand:number; }
// Deterministic sample demand feed. These are explicitly simulated candidates, not live orders.
export const MOCK_DEMAND_ORDERS:MockDemandOrder[]=[
 {id:'SIM-ORD-IN-201301-01',pincode:'201301',category:'Electronics',product:'Compatible electronics order',demand:88},
 {id:'SIM-ORD-IN-201301-02',pincode:'201301',category:'Books',product:'Compatible books order',demand:79},
 {id:'SIM-ORD-IN-110001-01',pincode:'110001',category:'Pantry',product:'Compatible pantry order',demand:82},
 {id:'SIM-ORD-IN-122001-01',pincode:'122001',category:'Household',product:'Compatible household order',demand:76},
];
