export type EventStatus = 'New' | 'Evaluated' | 'Approved' | 'On hold' | 'Matched' | 'Executed' | 'Fallback' | 'Rejected';
export type Actor = 'SYSTEM' | 'OPERATOR' | 'AI-ASSISTED';
export interface CancellationEvent {
  id: string; orderId: string; parcelId: string; product: string; category: string; valueInr: number;
  stage: string; score: number; pincode: string; distanceKm: number; demand: number; eligible: boolean;
  sealVerified: boolean;
  status: EventStatus; cancelledAt: string; holdHours: number; hub: string; hubCapacity: number;
  customerKept: boolean; partnerMinutes: number; conventionalCostInr: number; smartCostInr: number;
  matchedOrderId?: string;
}
export interface AuditEntry { id: string; eventId: string; at: string; actor: Actor; action: string; outcome: string; }
