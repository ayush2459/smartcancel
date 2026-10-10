import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { backendApi, type CancellationRecord, type DecisionReport, type OverviewMetrics } from '../services/backendApi';

const numberValue = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const dateValue = (value: string) => new Date(value).toLocaleString();

const isAwaitingApproval = (status: string | null) =>
  status === 'RECOMMENDED' || status === 'REVIEW_REQUIRED';

export function OperationsDashboard() {
  const [events, setEvents] = useState<CancellationRecord[]>([]);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [decision, setDecision] = useState<DecisionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState<'CUSTOMER_APP' | 'CUSTOMER_SUPPORT' | 'SYSTEM' | 'OPERATOR'>('OPERATOR');

  const selected = events.find((event) => event.event_id === selectedId);

  const refresh = useCallback(async () => {
    setError('');
    const [report, overview] = await Promise.all([
      backendApi.listCancellations(),
      backendApi.getOverview(),
    ]);
    setEvents(report.cancellations);
    setMetrics(overview.metrics);
    setSelectedId((current) =>
      report.cancellations.some((event) => event.event_id === current)
        ? current
        : report.cancellations[0]?.event_id ?? '',
    );
  }, []);

  useEffect(() => {
    refresh()
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load backend reports.');
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!selected?.decision_id) {
      setDecision(null);
      return;
    }

    let active = true;
    backendApi.getDecision(selected.decision_id)
      .then((report) => {
        if (active) setDecision(report);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setDecision(null);
          setError(loadError instanceof Error ? loadError.message : 'Unable to load decision details.');
        }
      });

    return () => {
      active = false;
    };
  }, [selected?.decision_id, selected?.decision_status]);

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Backend request failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitCancellation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await backendApi.createCancellation({
        order_number: orderNumber.trim(),
        reason: reason.trim(),
        source,
      });
      await refresh();
      setSelectedId(created.event_id);
      setOrderNumber('');
      setReason('');
      setNotice(created.duplicate ? 'Existing cancellation request loaded.' : 'Cancellation recorded by the backend.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Cancellation request failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <main className="max-w-7xl mx-auto px-4 py-10 text-sm text-slate-500">Connecting to the SmartCancy API…</main>;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-amber-700">LIVE BACKEND · OPERATIONS</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold">Cancellation recovery</h1>
          <p className="mt-1 text-sm text-slate-600">Real database records and API actions. Execution is simulation-only.</p>
        </div>
        <button onClick={() => void runAction(refresh, 'Backend data refreshed.')} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

      {metrics && <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Cancellation records', metrics.total_cancellations],
          ['Awaiting evaluation', metrics.processing_decisions],
          ['Awaiting review', metrics.decisions_requiring_review],
          ['Recorded savings (USD)', numberValue(metrics.recorded_cost_saved)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
          <div className="mt-1 text-[10px] text-slate-400">Values reported by backend</div>
        </div>)}
      </section>}

      <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-sm font-bold">Cancellation records</h2>
            <p className="mt-1 text-xs text-slate-500">{events.length} shown · most recent first</p>
          </div>
          {events.length === 0 ? <p className="p-5 text-sm text-slate-500">{error ? 'Backend records are unavailable until the API connection is restored.' : 'No backend records yet. Submit an order number below to create a cancellation request.'}</p> : <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr>{['Order / event', 'Parcel', 'Stage', 'Decision', 'Status'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{events.map((event) => <tr key={event.event_id} onClick={() => setSelectedId(event.event_id)} className={`cursor-pointer hover:bg-amber-50 ${selectedId === event.event_id ? 'bg-amber-50' : ''}`}>
                <td className="px-4 py-3"><b>{event.order_number}</b><div className="mt-1 text-slate-500">{dateValue(event.received_at)}</div></td>
                <td className="px-4 py-3">{event.parcel_number ?? '—'}</td>
                <td className="px-4 py-3">{event.parcel_status ?? event.stage_at_cancel}</td>
                <td className="px-4 py-3">{event.selected_action ?? event.decision_status ?? 'Not evaluated'}</td>
                <td className="px-4 py-3">{event.decision_status ?? event.event_status}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </div>

        <form onSubmit={(event) => void submitCancellation(event)} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h2 className="text-sm font-bold">Record a cancellation</h2>
            <p className="mt-1 text-xs text-slate-500">Uses an existing order in the configured database.</p>
          </div>
          <label className="block text-xs font-medium text-slate-700">Order number
            <input required maxLength={50} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="ORD-8421" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-slate-700">Reason
            <input required maxLength={100} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer request" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-slate-700">Source
            <select value={source} onChange={(event) => setSource(event.target.value as typeof source)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="OPERATOR">Operator</option><option value="CUSTOMER_APP">Customer app</option><option value="CUSTOMER_SUPPORT">Customer support</option><option value="SYSTEM">System</option>
            </select>
          </label>
          <button disabled={busy} className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-50">Submit cancellation</button>
        </form>
      </section>

      {selected && <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-sm font-bold">Selected order · {selected.order_number}</h2>
          <p className="mt-1 text-xs text-slate-500">{selected.reason} · {selected.source} · {selected.destination_pincode ?? 'No destination pincode'}</p>
          {decision && <>
            <p className="mt-3 text-sm"><b>{decision.decision.selected_action ?? 'No recommended action'}</b> · {decision.decision.status} · score {numberValue(decision.decision.recovery_score)}</p>
            {decision.decision.reasoning_summary && <p className="mt-1 text-xs text-slate-600">{decision.decision.reasoning_summary}</p>}
            {decision.candidates.length > 0 && <ul className="mt-3 space-y-1 text-xs text-slate-600">{decision.candidates.map((candidate) => <li key={candidate.action}>{candidate.feasible ? '✓' : '—'} {candidate.action}: {candidate.reason}</li>)}</ul>}
            {decision.impact && <p className="mt-3 text-[11px] text-slate-500">Recorded ledger: ${numberValue(decision.impact.cost_saved)} cost · {numberValue(decision.impact.distance_avoided_km)} km · {numberValue(decision.impact.carbon_avoided_kg)} kg CO₂e</p>}
          </>}
        </div>
        <div className="flex flex-wrap content-start gap-2">
          {selected.decision_status === 'PROCESSING' && <button disabled={busy} onClick={() => void runAction(() => backendApi.evaluateRecovery(selected.event_id), 'Recovery evaluation completed.')} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold disabled:opacity-50">Evaluate recovery</button>}
          {selected.decision_id && isAwaitingApproval(selected.decision_status) && <>
            <button disabled={busy} onClick={() => void runAction(() => backendApi.approveDecision(selected.decision_id!), 'Decision approved.')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve</button>
            <button disabled={busy} onClick={() => void runAction(() => backendApi.rejectDecision(selected.decision_id!), 'Decision rejected.')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">Reject</button>
          </>}
          {selected.decision_id && selected.decision_status === 'APPROVED' && <button disabled={busy} onClick={() => void runAction(() => backendApi.executeDecision(selected.decision_id!), 'Simulation executed. No real orders or parcels were changed.')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Execute simulation</button>}
        </div>
      </section>}

      <p className="text-[11px] text-slate-500">{metrics ? `${numberValue(metrics.recorded_impact_records)} impact ledger records. ${numberValue(metrics.recorded_distance_avoided_km)} km and ${numberValue(metrics.recorded_carbon_avoided_kg)} kg CO₂e are recorded totals, not independently verified savings.` : ''}</p>
    </main>
  );
}
