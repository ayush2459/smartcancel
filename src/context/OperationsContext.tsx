import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Actor, AuditEntry, CancellationEvent, EventStatus } from '../types/operations';
import { operationsApi } from '../services/operationsApi';
import { getCompatibleMockOrders } from '../utils/hubConstraints';
import { formatIndianDateTime } from '../utils/locale';
type Ctx={events:CancellationEvent[];selectedId:string;selectedEvent?:CancellationEvent;setSelectedId:(id:string)=>void;loading:boolean;error:string;updateStatus:(status:EventStatus,actor:Actor)=>Promise<void>;updateSelectedEvent:(patch:Partial<CancellationEvent>)=>void;reset:()=>void;audit:AuditEntry[];scenarioResult:string;setScenarioResult:(result:string)=>void;source:string};
const OperationsContext=createContext<Ctx|null>(null);
export const OperationsProvider:React.FC<React.PropsWithChildren>=({children})=>{
 const [events,setEvents]=useState<CancellationEvent[]>([]),[selectedId,setSelectedId]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[audit,setAudit]=useState<AuditEntry[]>([]),[scenarioResult,setScenarioResult]=useState('');
 useEffect(()=>{operationsApi.listEvents().then(items=>{setEvents(items);setSelectedId(items[0]?.id??'')}).catch(e=>setError(e instanceof Error?e.message:'Unable to load cancellation events')).finally(()=>setLoading(false));},[]);
 const selectedEvent=events.find(e=>e.id===selectedId);
 const chooseEvent=(id:string)=>{setSelectedId(id);setScenarioResult('');};
 const updateStatus=async(status:EventStatus,actor:Actor)=>{if(!selectedEvent)return;try{const updated=await operationsApi.updateStatus(selectedEvent.id,status);const matchedOrderId=status==='Matched'?getCompatibleMockOrders(selectedEvent)[0]?.id:status==='Executed'?selectedEvent.matchedOrderId:undefined;setEvents(prev=>prev.map(e=>e.id===updated.id?{...e,status:updated.status,matchedOrderId}:e));setAudit(prev=>[{id:`A-${prev.length+1}`,eventId:updated.id,at:formatIndianDateTime(new Date()),actor,action:`Status changed to ${status}`,outcome:status==='Matched'?`Matched to ${matchedOrderId??'no order'} in mock data`:`${status} confirmed by mock adapter`},...prev]);}catch(e){setError(e instanceof Error?e.message:'Action failed');}};
 const updateSelectedEvent=(patch:Partial<CancellationEvent>)=>{if(!selectedEvent)return;setEvents(prev=>prev.map(e=>e.id===selectedEvent.id?{...e,...patch}:e));};
 const reset=()=>{setEvents([]);setSelectedId('');setAudit([]);setScenarioResult('');setError('');setLoading(true);operationsApi.listEvents().then(items=>{setEvents(items);setSelectedId(items[0]?.id??'')}).catch(e=>setError(e instanceof Error?e.message:'Unable to load cancellation events')).finally(()=>setLoading(false));};
 const value=useMemo(()=>({events,selectedId,selectedEvent,setSelectedId:chooseEvent,loading,error,updateStatus,updateSelectedEvent,reset,audit,scenarioResult,setScenarioResult,source:operationsApi.source}),[events,selectedId,selectedEvent,loading,error,audit,scenarioResult]);
 return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
};
export const useOperations=()=>{const context=useContext(OperationsContext);if(!context)throw new Error('useOperations must be used inside OperationsProvider');return context;};
