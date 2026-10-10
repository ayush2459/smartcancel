-- Synthetic SmartCancy demo records for the Operations dashboard.
-- Safe to re-run: unique demo identifiers prevent duplicates, and existing
-- records are not overwritten when the workflow has already been used.
BEGIN;

INSERT INTO customers (external_ref, name, segment)
VALUES
  ('SMARTCANCY-DEMO-CUSTOMER-01', 'Demo Customer 01', 'DEMO'),
  ('SMARTCANCY-DEMO-CUSTOMER-02', 'Demo Customer 02', 'DEMO'),
  ('SMARTCANCY-DEMO-CUSTOMER-03', 'Demo Customer 03', 'DEMO'),
  ('SMARTCANCY-DEMO-CUSTOMER-04', 'Demo Customer 04', 'DEMO')
ON CONFLICT (external_ref) DO NOTHING;

INSERT INTO products (sku, name, category, unit_value, weight_kg, eligible_for_rematch)
VALUES
  ('SC-DEMO-EARBUDS', 'Demo Wireless Earbuds', 'Electronics', 49.99, 0.180, TRUE),
  ('SC-DEMO-READER', 'Demo E-reader', 'Electronics', 139.99, 0.210, TRUE),
  ('SC-DEMO-LAMP', 'Demo Desk Lamp', 'Household', 34.99, 0.750, TRUE),
  ('SC-DEMO-BERRIES', 'Demo Fresh Berries', 'Perishable', 8.99, 0.400, FALSE)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO hubs (code, name, pincode, capacity)
VALUES ('SC-DEMO-SEA-NORTH', 'Demo Seattle North Hub', '98109', 24)
ON CONFLICT (code) DO NOTHING;

INSERT INTO orders (
  order_number, customer_id, product_id, current_status, quantity,
  order_value, destination_pincode
)
SELECT demo.order_number, customers.customer_id, products.product_id,
       demo.current_status::order_status, 1, demo.order_value, '98109'
FROM (VALUES
  ('DEMO-SC-1001', 'SMARTCANCY-DEMO-CUSTOMER-01', 'SC-DEMO-EARBUDS', 'PACKED', 49.99),
  ('DEMO-SC-1002', 'SMARTCANCY-DEMO-CUSTOMER-02', 'SC-DEMO-READER', 'DISPATCHED', 139.99),
  ('DEMO-SC-1003', 'SMARTCANCY-DEMO-CUSTOMER-03', 'SC-DEMO-LAMP', 'OUT_FOR_DELIVERY', 34.99),
  ('DEMO-SC-1004', 'SMARTCANCY-DEMO-CUSTOMER-04', 'SC-DEMO-BERRIES', 'PLACED', 8.99)
) AS demo(order_number, customer_ref, sku, current_status, order_value)
JOIN customers ON customers.external_ref = demo.customer_ref
JOIN products ON products.sku = demo.sku
ON CONFLICT (order_number) DO NOTHING;

INSERT INTO routes (route_code, hub_id, status, remaining_km, remaining_stops)
SELECT 'SC-DEMO-ROUTE-01', hub_id, 'ACTIVE', 8.4, 3
FROM hubs
WHERE code = 'SC-DEMO-SEA-NORTH'
ON CONFLICT (route_code) DO NOTHING;

INSERT INTO parcels (
  parcel_number, order_id, status, current_hub_id, current_route_id,
  seal_intact, damaged, irreversibility_score
)
SELECT demo.parcel_number, orders.order_id, demo.parcel_status::parcel_status,
       hubs.hub_id, routes.route_id, TRUE, FALSE, demo.irreversibility_score
FROM (VALUES
  ('DEMO-SC-PARCEL-1001', 'DEMO-SC-1001', 'PACKED', 42, FALSE),
  ('DEMO-SC-PARCEL-1002', 'DEMO-SC-1002', 'IN_TRANSIT', 76, TRUE),
  ('DEMO-SC-PARCEL-1003', 'DEMO-SC-1003', 'OUT_FOR_DELIVERY', 92, TRUE),
  ('DEMO-SC-PARCEL-1004', 'DEMO-SC-1004', 'CREATED', 12, FALSE)
) AS demo(parcel_number, order_number, parcel_status, irreversibility_score, has_route)
JOIN orders ON orders.order_number = demo.order_number
JOIN hubs ON hubs.code = 'SC-DEMO-SEA-NORTH'
LEFT JOIN routes ON routes.route_code = 'SC-DEMO-ROUTE-01' AND demo.has_route
ON CONFLICT (parcel_number) DO NOTHING;

INSERT INTO demand_signals (
  pincode, product_id, orders_last_30d, open_orders, cart_count, demand_score
)
SELECT '98109', product_id, 18, 4, 7, 0.82
FROM products
WHERE sku IN ('SC-DEMO-EARBUDS', 'SC-DEMO-READER', 'SC-DEMO-LAMP')
ON CONFLICT (pincode, product_id) DO NOTHING;

INSERT INTO cancellation_events (
  idempotency_key, order_id, parcel_id, source, reason, stage_at_cancel,
  occurred_at, received_at, payload
)
SELECT demo.idempotency_key, orders.order_id, parcels.parcel_id, 'OPERATOR',
       'DEMO - customer requested cancellation',
       parcels.status, now() - demo.age, now() - demo.age,
       jsonb_build_object('demo', TRUE, 'note', 'Synthetic demonstration record')
FROM (VALUES
  ('smartcancy-demo-2026-1001', 'DEMO-SC-1001', interval '8 minutes'),
  ('smartcancy-demo-2026-1002', 'DEMO-SC-1002', interval '18 minutes'),
  ('smartcancy-demo-2026-1003', 'DEMO-SC-1003', interval '32 minutes'),
  ('smartcancy-demo-2026-1004', 'DEMO-SC-1004', interval '46 minutes')
) AS demo(idempotency_key, order_number, age)
JOIN orders ON orders.order_number = demo.order_number
JOIN parcels ON parcels.order_id = orders.order_id
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO decisions (
  event_id, selected_action, status, recovery_score, model_confidence,
  policy_status, approval_mode, scoring_version, reasoning_summary, tool_trace
)
SELECT events.event_id,
       CASE events.idempotency_key
         WHEN 'smartcancy-demo-2026-1002' THEN 'CONTINUE'::recovery_action
         WHEN 'smartcancy-demo-2026-1003' THEN 'RETURN'::recovery_action
         WHEN 'smartcancy-demo-2026-1004' THEN 'STOP'::recovery_action
         ELSE NULL
       END,
       CASE events.idempotency_key
         WHEN 'smartcancy-demo-2026-1002' THEN 'RECOMMENDED'::decision_status
         WHEN 'smartcancy-demo-2026-1003' THEN 'REVIEW_REQUIRED'::decision_status
         WHEN 'smartcancy-demo-2026-1004' THEN 'APPROVED'::decision_status
         ELSE 'PROCESSING'::decision_status
       END,
       CASE events.idempotency_key
         WHEN 'smartcancy-demo-2026-1002' THEN 82
         WHEN 'smartcancy-demo-2026-1003' THEN 48
         WHEN 'smartcancy-demo-2026-1004' THEN 90
         ELSE NULL
       END,
       CASE WHEN events.idempotency_key = 'smartcancy-demo-2026-1001' THEN NULL ELSE 1.0 END,
       CASE events.idempotency_key
         WHEN 'smartcancy-demo-2026-1002' THEN 'RULES_EVALUATED'
         WHEN 'smartcancy-demo-2026-1003' THEN 'HUMAN_REQUIRED'
         WHEN 'smartcancy-demo-2026-1004' THEN 'RULES_EVALUATED'
         ELSE 'PENDING'
       END,
       CASE events.idempotency_key
         WHEN 'smartcancy-demo-2026-1002' THEN 'HUMAN_REQUIRED'
         WHEN 'smartcancy-demo-2026-1003' THEN 'HUMAN_REQUIRED'
         WHEN 'smartcancy-demo-2026-1004' THEN 'HUMAN_APPROVED'
         ELSE 'PENDING'
       END,
       'rules-v1',
       CASE events.idempotency_key
         WHEN 'smartcancy-demo-2026-1002' THEN 'DEMO: CONTINUE recommendation; operator approval required.'
         WHEN 'smartcancy-demo-2026-1003' THEN 'DEMO: RETURN requires human review; execution remains simulated.'
         WHEN 'smartcancy-demo-2026-1004' THEN 'DEMO: STOP approved; ready for simulated execution.'
         ELSE 'DEMO: Ready for recovery evaluation.'
       END,
       jsonb_build_object('demo', TRUE, 'execution_performed', FALSE)
FROM cancellation_events AS events
WHERE events.idempotency_key IN (
  'smartcancy-demo-2026-1001',
  'smartcancy-demo-2026-1002',
  'smartcancy-demo-2026-1003',
  'smartcancy-demo-2026-1004'
)
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO recovery_candidates (
  decision_id, action, feasible, reason, estimated_cost,
  estimated_distance_km, estimated_carbon_kg, risk_score,
  sla_risk_score, score
)
SELECT decisions.decision_id, demo.action::recovery_action, TRUE, demo.reason,
       demo.estimated_cost, demo.estimated_distance_km,
       demo.estimated_carbon_kg, demo.risk_score, demo.sla_risk_score,
       demo.score
FROM (VALUES
  ('smartcancy-demo-2026-1002', 'CONTINUE', 'DEMO: parcel is already in transit; avoid reversal.', 224.00, 8.00, 0.960, 15, 10, 82),
  ('smartcancy-demo-2026-1003', 'RETURN', 'DEMO: return requires operator review at this delivery stage.', 276.00, 8.00, 0.960, 35, 60, 48),
  ('smartcancy-demo-2026-1004', 'STOP', 'DEMO: fulfillment can stop before dispatch.', 20.00, 0.00, 0.000, 10, 5, 90)
) AS demo(idempotency_key, action, reason, estimated_cost,
         estimated_distance_km, estimated_carbon_kg, risk_score,
         sla_risk_score, score)
JOIN cancellation_events AS events ON events.idempotency_key = demo.idempotency_key
JOIN decisions ON decisions.event_id = events.event_id
WHERE NOT EXISTS (
  SELECT 1 FROM recovery_candidates existing
  WHERE existing.decision_id = decisions.decision_id
    AND existing.action = demo.action::recovery_action
);

COMMIT;
