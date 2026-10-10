import { Router } from 'express';

const PILOT_ENERGY_ASSUMPTIONS = {
  local_return_km_per_order: 38.5,
  bike_mileage_km_per_liter: 45,
  petrol_price_inr_per_liter: 112.05,
  co2e_kg_per_liter: 2.31,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createReportsRouter(pool) {
  const router = Router();

  // Aggregate operational metrics. Impact is included only when recorded.
  router.get('/overview', async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(DISTINCT e.event_id)::int AS total_cancellations,
          COUNT(DISTINCT e.event_id) FILTER (
            WHERE e.status = 'RECEIVED'
          )::int AS received_events,
          COUNT(DISTINCT d.decision_id) FILTER (
            WHERE d.status = 'PROCESSING'
          )::int AS processing_decisions,
          COUNT(DISTINCT d.decision_id) FILTER (
            WHERE d.status = 'RECOMMENDED'
          )::int AS recommended_decisions,
          COUNT(DISTINCT d.decision_id) FILTER (
            WHERE d.status = 'REVIEW_REQUIRED'
          )::int AS decisions_requiring_review,
          COUNT(DISTINCT i.impact_id)::int AS recorded_impact_records,
          COALESCE(SUM(i.cost_saved), 0) AS recorded_cost_saved,
          COALESCE(SUM(i.distance_avoided_km), 0)
            AS recorded_distance_avoided_km,
          COALESCE(SUM(i.carbon_avoided_kg), 0)
            AS recorded_carbon_avoided_kg
        FROM cancellation_events e
        LEFT JOIN decisions d ON d.event_id = e.event_id
        LEFT JOIN impact_ledger i ON i.decision_id = d.decision_id
      `);

      res.json({
        generated_at: new Date().toISOString(),
        metrics: result.rows[0],
        impact_note: 'Impact totals include recorded ledger entries only; they are not independently verified savings.',
      });
    } catch (error) {
      console.error('Reports overview failed:', error.message);
      res.status(500).json({ error: 'REPORTS_OVERVIEW_FAILED' });
    }
  });

  router.get('/hub-inventory', async (_req, res) => {
    try {
      const [hubsResult, parcelsResult] = await Promise.all([
        pool.query(`
          SELECT
            h.hub_id,
            h.code,
            h.name,
            h.pincode,
            h.capacity,
            h.status,
            COUNT(p.parcel_id) FILTER (WHERE p.status = 'HELD')::int
              AS held_parcels
          FROM hubs h
          LEFT JOIN parcels p ON p.current_hub_id = h.hub_id
          WHERE h.code LIKE 'SC-PILOT-%'
          GROUP BY h.hub_id
          ORDER BY h.code
        `),
        pool.query(`
          SELECT
            h.hub_id,
            p.parcel_id,
            p.parcel_number,
            p.status AS parcel_status,
            p.seal_intact,
            p.hold_until,
            o.order_number,
            o.destination_pincode,
            pr.name AS product_name,
            pr.category,
            COALESCE(ds.demand_score, 0) * 100 AS demand_score,
            COALESCE(ds.orders_last_30d, 0)::int AS orders_last_30d,
            COALESCE(ds.open_orders, 0)::int AS open_orders,
            COALESCE(ds.cart_count, 0)::int AS cart_count
          FROM parcels p
          JOIN hubs h ON h.hub_id = p.current_hub_id
          JOIN orders o ON o.order_id = p.order_id
          JOIN products pr ON pr.product_id = o.product_id
          LEFT JOIN demand_signals ds
            ON ds.product_id = o.product_id
            AND ds.pincode = o.destination_pincode
          WHERE h.code LIKE 'SC-PILOT-%'
            AND p.status = 'HELD'
          ORDER BY h.code, p.parcel_number
        `),
      ]);

      res.json({
        generated_at: new Date().toISOString(),
        hubs: hubsResult.rows,
        held_parcels: parcelsResult.rows,
        note: 'Hub capacity and held parcels are read from PostgreSQL. Demand scores are seeded synthetic signals; seal status is a stored flag, not an image inspection.',
      });
    } catch (error) {
      console.error('Hub inventory report failed:', error.message);
      res.status(500).json({ error: 'HUB_INVENTORY_REPORT_FAILED' });
    }
  });

  router.get('/pilot-roi', async (_req, res) => {
    try {
      const [ordersResult, impactResult] = await Promise.all([
        pool.query(`
          SELECT
            e.event_id,
            e.received_at,
            e.stage_at_cancel,
            e.payload->>'origin_city' AS origin_city,
            e.payload->>'destination_city' AS destination_city,
            NULLIF(e.payload->>'road_distance_km_one_way', '')::numeric
              AS road_distance_km_one_way,
            NULLIF(e.payload->>'distance_source', '') AS distance_source,
            o.order_number,
            o.destination_pincode,
            o.order_value,
            p.parcel_number,
            p.status AS parcel_status,
            d.selected_action,
            d.status AS decision_status
          FROM cancellation_events e
          JOIN orders o ON o.order_id = e.order_id
          LEFT JOIN parcels p ON p.parcel_id = e.parcel_id
          LEFT JOIN decisions d ON d.event_id = e.event_id
          WHERE e.payload->>'pilot_id' = 'BLR_DELHI_5'
          ORDER BY o.order_number
        `),
        pool.query(`
          SELECT
            COUNT(DISTINCT i.impact_id)::int AS recorded_impact_records,
            COALESCE(SUM(i.cost_saved), 0) AS recorded_cost_saved,
            COALESCE(SUM(i.distance_avoided_km), 0)
              AS recorded_distance_avoided_km,
            COALESCE(SUM(i.carbon_avoided_kg), 0)
              AS recorded_carbon_avoided_kg
          FROM cancellation_events e
          JOIN decisions d ON d.event_id = e.event_id
          LEFT JOIN impact_ledger i ON i.decision_id = d.decision_id
          WHERE e.payload->>'pilot_id' = 'BLR_DELHI_5'
        `),
      ]);

      const orders = ordersResult.rows;
      const laneDistance = Number(orders[0]?.road_distance_km_one_way ?? 0);
      const routeDistances = orders.map((order) =>
        Number(order.road_distance_km_one_way ?? 0)
      );
      const modeledReturnDistanceKm = routeDistances.reduce(
        (sum, distance) => sum + distance,
        0
      );
      const modeledLocalReturnDistanceKm =
        orders.length * PILOT_ENERGY_ASSUMPTIONS.local_return_km_per_order;
      const potentialAvoidedFuelLiters =
        modeledLocalReturnDistanceKm /
        PILOT_ENERGY_ASSUMPTIONS.bike_mileage_km_per_liter;
      const energyModel = orders.length > 0 ? {
        modeled_local_return_distance_km: Number(
          modeledLocalReturnDistanceKm.toFixed(1)
        ),
        potential_avoided_fuel_liters: Number(
          potentialAvoidedFuelLiters.toFixed(1)
        ),
        potential_fuel_cost_inr: Number(
          (potentialAvoidedFuelLiters *
            PILOT_ENERGY_ASSUMPTIONS.petrol_price_inr_per_liter).toFixed(2)
        ),
        potential_avoided_co2e_kg: Number(
          (potentialAvoidedFuelLiters *
            PILOT_ENERGY_ASSUMPTIONS.co2e_kg_per_liter).toFixed(1)
        ),
        assumptions: PILOT_ENERGY_ASSUMPTIONS,
        note: 'Conditional estimate if each pilot cancellation would otherwise require a 38.5 km local return trip and that trip is avoided. Uses the existing SmartCancy local return-distance and petrol-price assumptions, plus an illustrative 45 km/L petrol bike. Not measured fuel use, current pump pricing, or realized savings.',
      } : null;

      res.json({
        generated_at: new Date().toISOString(),
        pilot_id: 'BLR_DELHI_5',
        origin_city: orders[0]?.origin_city ?? null,
        destination_city: orders[0]?.destination_city ?? null,
        distance_source: orders[0]?.distance_source ?? null,
        road_distance_km_one_way: laneDistance || null,
        orders,
        energy_model: energyModel,
        totals: {
          order_count: orders.length,
          estimated_return_distance_km: Number(modeledReturnDistanceKm.toFixed(1)),
          ...impactResult.rows[0],
        },
        note: 'The Bengaluru–Delhi route is a planning estimate stored with synthetic pilot orders, not live GPS or carrier measurement. The separate local petrol-bike scenario is conditional and uses explicit assumptions; verified outcomes are reported only from the impact ledger.',
      });
    } catch (error) {
      console.error('Pilot ROI report failed:', error.message);
      res.status(500).json({ error: 'PILOT_ROI_REPORT_FAILED' });
    }
  });

  // Paginated cancellation history.
  router.get('/cancellations', async (req, res) => {
    const limit = Number.parseInt(req.query.limit ?? '20', 10);
    const offset = Number.parseInt(req.query.offset ?? '0', 10);

    if (
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0
    ) {
      return res.status(400).json({
        error: 'INVALID_PAGINATION',
        message: 'limit must be 1-100 and offset must be zero or greater.',
      });
    }

    try {
      const result = await pool.query(`
        SELECT
          e.event_id,
          e.idempotency_key,
          e.source,
          e.reason,
          e.status AS event_status,
          e.stage_at_cancel,
          e.occurred_at,
          e.received_at,
          o.order_number,
          o.current_status AS order_status,
          o.order_value,
          o.destination_pincode,
          p.parcel_number,
          p.status AS parcel_status,
          d.decision_id,
          d.status AS decision_status,
          d.selected_action,
          d.recovery_score,
          d.scoring_version
        FROM cancellation_events e
        JOIN orders o ON o.order_id = e.order_id
        LEFT JOIN parcels p ON p.parcel_id = e.parcel_id
        LEFT JOIN decisions d ON d.event_id = e.event_id
        ORDER BY e.received_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const countResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM cancellation_events'
      );

      res.json({
        pagination: {
          limit,
          offset,
          total: countResult.rows[0].total,
        },
        cancellations: result.rows,
      });
    } catch (error) {
      console.error('Cancellation report failed:', error.message);
      res.status(500).json({ error: 'CANCELLATION_REPORT_FAILED' });
    }
  });

  // One decision with its candidate rankings and recorded impact.
  router.get('/decisions/:decisionId', async (req, res) => {
    const { decisionId } = req.params;

    if (!UUID_PATTERN.test(decisionId)) {
      return res.status(400).json({ error: 'INVALID_DECISION_ID' });
    }

    try {
      const decisionResult = await pool.query(`
        SELECT
          d.decision_id,
          d.event_id,
          d.selected_action,
          d.status,
          d.recovery_score,
          d.model_confidence,
          d.policy_status,
          d.approval_mode,
          d.scoring_version,
          d.reasoning_summary,
          d.input_snapshot,
          d.tool_trace,
          d.created_at,
          d.updated_at,
          e.idempotency_key,
          e.reason,
          e.source,
          e.stage_at_cancel,
          o.order_number,
          o.current_status AS order_status
        FROM decisions d
        JOIN cancellation_events e ON e.event_id = d.event_id
        JOIN orders o ON o.order_id = e.order_id
        WHERE d.decision_id = $1
      `, [decisionId]);

      if (decisionResult.rowCount === 0) {
        return res.status(404).json({ error: 'DECISION_NOT_FOUND' });
      }

      const [candidateResult, impactResult] = await Promise.all([
        pool.query(`
          SELECT
            candidate_id, action, feasible, reason,
            estimated_cost, estimated_distance_km,
            estimated_carbon_kg, risk_score,
            sla_risk_score, score, created_at
          FROM recovery_candidates
          WHERE decision_id = $1
          ORDER BY score DESC NULLS LAST, action
        `, [decisionId]),
        pool.query(`
          SELECT
            baseline_cost, optimized_cost, cost_saved,
            baseline_distance_km, optimized_distance_km,
            distance_avoided_km, baseline_carbon_kg,
            optimized_carbon_kg, carbon_avoided_kg,
            baseline_handling_events, optimized_handling_events,
            created_at
          FROM impact_ledger
          WHERE decision_id = $1
        `, [decisionId]),
      ]);

      res.json({
        decision: decisionResult.rows[0],
        candidates: candidateResult.rows,
        impact: impactResult.rows[0] ?? null,
      });
    } catch (error) {
      console.error('Decision report failed:', error.message);
      res.status(500).json({ error: 'DECISION_REPORT_FAILED' });
    }
  });

  return router;
}
