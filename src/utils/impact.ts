import type { CancellationEvent } from '../types/operations';
import { isRecoveryEligible } from './hubConstraints';
// Planning assumptions are illustrative fleet averages, not measured system outcomes.
export const IMPACT_ASSUMPTIONS = { fuelLPerKm: 0.12, co2KgPerL: 2.68, conventionalReturnKm: 38.5, fuelInrPerL: 112.05, handlingInr: 265.6, rematchHandlingInr: 257.3 } as const;
export function calculateImpact(event: CancellationEvent) {
 const a=IMPACT_ASSUMPTIONS;
 const conventionalDistance=event.customerKept?event.distanceKm:event.score<=25?0:event.distanceKm+a.conventionalReturnKm;
 const conventional={distanceKm: conventionalDistance, fuelL:conventionalDistance*a.fuelLPerKm, co2Kg:conventionalDistance*a.fuelLPerKm*a.co2KgPerL, partnerMinutes:event.customerKept?event.partnerMinutes:event.score<=25?0:event.partnerMinutes+18, costInr:event.customerKept?event.smartCostInr:event.conventionalCostInr};
 const recoveryEligible=isRecoveryEligible(event);
 const smart=recoveryEligible?{distanceKm:event.distanceKm, fuelL:event.distanceKm*a.fuelLPerKm, co2Kg:event.distanceKm*a.fuelLPerKm*a.co2KgPerL, partnerMinutes:Math.round(event.partnerMinutes*.55), costInr:event.smartCostInr}:{...conventional};
 return {conventional,smart,savings:{distanceKm:Math.max(0,conventional.distanceKm-smart.distanceKm),fuelL:Math.max(0,conventional.fuelL-smart.fuelL),co2Kg:Math.max(0,conventional.co2Kg-smart.co2Kg),partnerMinutes:Math.max(0,conventional.partnerMinutes-smart.partnerMinutes),costInr:Math.max(0,conventional.costInr-smart.costInr)}};
}
