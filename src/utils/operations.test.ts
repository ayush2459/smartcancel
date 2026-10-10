import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_EVENTS } from '../data/operationsMock';
import { calculateImpact } from './impact';
import { canPlaceOnHold, getCompatibleMockOrders } from './hubConstraints';
import { evaluateScenario } from './scenario';

describe('shared cancellation operations calculations',()=>{
 const event=MOCK_EVENTS[0];
 it('uses shared fuel and CO2e assumptions and labels route savings as a comparison',()=>{
  const result=calculateImpact(event);
  assert.ok(result.conventional.co2Kg>result.smart.co2Kg);
  assert.equal(result.savings.distanceKm,38.5);
  assert.ok(result.savings.fuelL>0);
 });
 it('rejects a hub hold when capacity is consumed or parcel eligibility fails',()=>{
  const full={...event,hubCapacity:1};
  const held={...MOCK_EVENTS[1],hub:event.hub,status:'On hold' as const};
  assert.equal(canPlaceOnHold(full,[full,held]).allowed,false);
  assert.equal(canPlaceOnHold({...event,sealVerified:false},[event]).allowed,false);
  assert.equal(canPlaceOnHold({...event,pincode:'00000'},[event]).allowed,false);
  assert.ok(getCompatibleMockOrders(event).length>0);
 });
 it('produces identical scenario output for identical event inputs',()=>{
  for(const scenario of ['early','nearby','lastmile','nodemand','capacity','value','simultaneous','failure'] as const){
   const first=evaluateScenario(scenario,event,MOCK_EVENTS);
   const second=evaluateScenario(scenario,event,MOCK_EVENTS);
   assert.deepEqual(first,second,`${scenario} should replay identically`);
  }
  assert.match(evaluateScenario('simultaneous',event,MOCK_EVENTS).decision,/deterministic allocation/i);
 });
});
