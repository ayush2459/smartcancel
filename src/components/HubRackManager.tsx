import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clock, Package, RefreshCw, ShieldCheck } from 'lucide-react';
import { backendApi, type HubInventory } from '../services/backendApi';

export function HubRackManager() {
  const [inventory, setInventory] = useState<HubInventory | null>(null);
  const [selectedHubId, setSelectedHubId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    const report = await backendApi.getHubInventory();
    setInventory(report);
    setSelectedHubId((current) => {
      if (report.hubs.some((hub) => hub.hub_id === current)) return current;
      return report.hubs.find((hub) => hub.code === 'SC-PILOT-DEL1')?.hub_id
        ?? report.hubs[0]?.hub_id
        ?? '';
    });
  }, []);

  useEffect(() => {
    refresh()
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load hub inventory.');
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const refreshInventory = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to refresh hub inventory.');
    } finally {
      setRefreshing(false);
    }
  };

  const selectedHub = inventory?.hubs.find((hub) => hub.hub_id === selectedHubId);
  const heldParcels = useMemo(
    () => inventory?.held_parcels.filter((parcel) => parcel.hub_id === selectedHubId) ?? [],
    [inventory?.held_parcels, selectedHubId],
  );
  const slots = useMemo(
    () => Array.from({ length: selectedHub?.capacity ?? 0 }, (_, index) => ({
      index,
      parcel: heldParcels[index] ?? null,
    })),
    [heldParcels, selectedHub?.capacity],
  );
  const currentSlot = slots[selectedSlot] ?? slots[0];

  if (loading) {
    return <main className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-500">Loading PostgreSQL hub inventory…</main>;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-amber-700">LIVE BACKEND · HUB INVENTORY</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Hub staging capacity</h1>
          <p className="mt-1 text-sm text-slate-600">Read-only parcel and capacity data from PostgreSQL. This screen does not create dispatches or matches.</p>
        </div>
        <button
          onClick={() => void refreshInventory()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh inventory
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {inventory && (
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          {inventory.note}
        </p>
      )}

      {!error && inventory?.hubs.length === 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No pilot hubs are recorded in PostgreSQL yet. Run the documented demo seed to load the five-order pilot.
        </section>
      )}

      {selectedHub && (
        <>
          <section className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block text-xs font-medium text-slate-700">
              Pilot hub
              <select
                value={selectedHub.hub_id}
                onChange={(event) => {
                  setSelectedHubId(event.target.value);
                  setSelectedSlot(0);
                }}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {inventory?.hubs.map((hub) => (
                  <option key={hub.hub_id} value={hub.hub_id}>{hub.name} · {hub.pincode}</option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm">
              <span className="text-slate-500">Stored hub status</span>
              <div className="mt-1 font-semibold">{selectedHub.status}</div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold">{selectedHub.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Pincode {selectedHub.pincode} · {heldParcels.length} held / {selectedHub.capacity} capacity
                  </p>
                </div>
                <p className="text-[10px] text-slate-500">As reported at {new Date(inventory?.generated_at ?? '').toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {slots.map(({ index, parcel }) => (
                  <button
                    key={`${selectedHub.hub_id}-${index}`}
                    type="button"
                    onClick={() => setSelectedSlot(index)}
                    className={`min-h-28 rounded-xl border-2 p-3 text-left ${selectedSlot === index ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : parcel ? 'border-amber-200 bg-amber-50/50' : 'border-dashed border-slate-300 bg-slate-50'}`}
                  >
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <b>{selectedHub.code}-{String(index + 1).padStart(2, '0')}</b>
                      <span className={parcel ? 'font-semibold text-amber-800' : 'text-slate-400'}>{parcel ? 'Held' : 'Empty'}</span>
                    </span>
                    {parcel ? (
                      <span className="mt-3 block">
                        <span className="block truncate text-xs font-semibold">{parcel.parcel_number}</span>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">{parcel.product_name}</span>
                        <span className="mt-1 block text-[10px] text-slate-500">{parcel.order_number}</span>
                      </span>
                    ) : (
                      <span className="mt-5 flex items-center gap-1 text-[11px] text-slate-400"><Package className="h-3.5 w-3.5" />No held parcel</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="border-b border-slate-100 pb-3 text-sm font-bold">Slot details</h2>
              {!currentSlot?.parcel ? (
                <div className="py-8 text-sm text-slate-500">This slot has no parcel with HELD status in the database.</div>
              ) : (
                <div className="space-y-4 pt-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Parcel / order</p>
                    <p className="mt-1 font-semibold">{currentSlot.parcel.parcel_number}</p>
                    <p className="text-xs text-slate-600">{currentSlot.parcel.order_number} · {currentSlot.parcel.product_name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] text-slate-500">Destination pincode</p>
                      <p className="mt-1 font-mono text-xs font-semibold">{currentSlot.parcel.destination_pincode}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] text-slate-500">Parcel state</p>
                      <p className="mt-1 text-xs font-semibold">{currentSlot.parcel.parcel_status}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <ShieldCheck className="h-4 w-4 text-emerald-700" />
                      Stored seal flag: {currentSlot.parcel.seal_intact ? 'intact' : 'not intact'}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Database flag only; no image or optical inspection is represented here.</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Clock className="h-4 w-4 text-slate-500" />
                      Hold expiry
                    </div>
                    <p className="mt-1 text-xs">
                      {currentSlot.parcel.hold_until
                        ? new Date(currentSlot.parcel.hold_until).toLocaleString()
                        : 'No expiry timestamp recorded'}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">Expiry is stored data; this prototype does not run an automatic TTL service.</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-semibold">Seeded demand signal</p>
                    <p className="mt-1 text-xs">{Number(currentSlot.parcel.demand_score).toFixed(0)} / 100 · {currentSlot.parcel.orders_last_30d} orders in the last 30 days</p>
                    <p className="mt-1 text-[10px] text-slate-500">{currentSlot.parcel.open_orders} open orders · {currentSlot.parcel.cart_count} carts in synthetic pilot data</p>
                  </div>
                </div>
              )}
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
