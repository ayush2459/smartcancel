import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Leaf, RefreshCw, Route } from 'lucide-react';
import { backendApi, type PilotRoiReport } from '../services/backendApi';

const numberValue = (value: number | string | null | undefined, digits = 1) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits });

const moneyValue = (value: number | string | null | undefined) =>
  `₹${Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function MetricsAndRoi() {
  const [report, setReport] = useState<PilotRoiReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    setReport(await backendApi.getPilotRoi());
  }, []);

  useEffect(() => {
    refresh()
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load pilot impact report.');
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const refreshReport = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to refresh pilot impact report.');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <main className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-500">Loading persisted pilot and impact data…</main>;
  }

  const totals = report?.totals;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-amber-700">LIVE BACKEND · PILOT IMPACT</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Five-order route pilot</h1>
          <p className="mt-1 text-sm text-slate-600">Bengaluru → Delhi pilot records, plus a separate local petrol-bike scenario using explicit assumptions.</p>
        </div>
        <button
          onClick={() => void refreshReport()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh report
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {report && (
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          {report.note}
        </p>
      )}

      {report && report.orders.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No records for the five-order pilot are in PostgreSQL. Run <code>database/seed-demo.sql</code> to load the synthetic sample. This view does not substitute mock totals.
        </section>
      ) : report && totals && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Pilot cancellation records" value={numberValue(totals.order_count, 0)} detail="Counted from the pilot records in PostgreSQL" icon={<Route className="h-4 w-4 text-blue-700" />} />
            <MetricCard label="Planning distance / one way" value={`${numberValue(report.road_distance_km_one_way, 0)} km`} detail="Bengaluru ↔ Delhi · approximate, not live routing" icon={<Route className="h-4 w-4 text-amber-700" />} />
            <MetricCard label="Modeled return-distance exposure" value={`${numberValue(totals.estimated_return_distance_km, 0)} km`} detail={`${numberValue(totals.order_count, 0)} records × planning distance; not distance saved`} icon={<Leaf className="h-4 w-4 text-emerald-700" />} />
          </section>

          {report.energy_model && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="border-b border-emerald-200 pb-4">
                <p className="text-[10px] font-semibold tracking-wide text-emerald-800">MODELED LOCAL SCENARIO · NOT MEASURED SAVINGS</p>
                <h2 className="mt-1 text-base font-bold">Potential last-mile petrol-bike savings</h2>
                <p className="mt-1 text-xs text-emerald-950">{report.energy_model.note}</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <RecordedMetric label="Potential petrol cost avoided" value={moneyValue(report.energy_model.potential_fuel_cost_inr)} />
                <RecordedMetric label="Fuel equivalent" value={`${numberValue(report.energy_model.potential_avoided_fuel_liters)} L`} />
                <RecordedMetric label="Potential CO₂e" value={`${numberValue(report.energy_model.potential_avoided_co2e_kg)} kg`} />
                <RecordedMetric label="Modeled local return distance" value={`${numberValue(report.energy_model.modeled_local_return_distance_km)} km`} />
              </div>
              <p className="mt-3 text-[10px] text-emerald-900">
                Calculation: {numberValue(totals.order_count, 0)} pilot records × {numberValue(report.energy_model.assumptions.local_return_km_per_order, 1)} km local-return assumption ÷ {numberValue(report.energy_model.assumptions.bike_mileage_km_per_liter, 0)} km/L × {moneyValue(report.energy_model.assumptions.petrol_price_inr_per_liter)}/L petrol. CO₂e uses {numberValue(report.energy_model.assumptions.co2e_kg_per_liter, 2)} kg/L. This local scenario is not the 2,150 km Bengaluru–Delhi lane and is not actual vehicle telemetry.
              </p>
            </section>
          )}

          <p role="note" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            No measured impact-ledger entries have been recorded for this pilot yet. Potential petrol savings above are modeled, not verified operational savings.
          </p>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold">Pilot records · {report.origin_city ?? 'Origin'} to {report.destination_city ?? 'destination'}</h2>
              <p className="mt-1 text-xs text-slate-500">{report.orders.length} synthetic orders loaded from PostgreSQL · destination pincode 110001</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>{['Order', 'Parcel', 'Stage at cancellation', 'Current parcel status', 'Decision'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.orders.map((order) => (
                    <tr key={order.event_id}>
                      <td className="px-4 py-3 font-semibold">{order.order_number}</td>
                      <td className="px-4 py-3">{order.parcel_number ?? '—'}</td>
                      <td className="px-4 py-3">{order.stage_at_cancel}</td>
                      <td className="px-4 py-3">{order.parcel_status ?? '—'}</td>
                      <td className="px-4 py-3">{order.selected_action ?? '—'} · {order.decision_status ?? 'No decision'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] text-slate-500">
            Distance source: {report.distance_source ?? 'not specified'}. The 2,150 km figure is a synthetic planning assumption for one direction. The return-distance figure is exposure if each listed parcel travels back toward origin; it is not a verified route, a realized trip, or a SmartCancy saving. No annualization, conversion rate, cancellation-rate assumption, or match-rate assumption is applied.
          </p>
        </>
      )}
    </main>
  );
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{label}</span>{icon}
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums">{value}</div>
      <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function RecordedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
