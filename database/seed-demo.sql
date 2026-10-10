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

-- Five synthetic Bangalore-to-Delhi cancellation cases for the pilot views.
-- 2,150 km is a planning assumption, not a measured route or carrier quote.
INSERT INTO customers (external_ref, name, segment)
SELECT demo.customer_ref, demo.customer_name, 'DEMO'
FROM (VALUES
  ('SC-BLR-DEL-CUSTOMER-01', 'Pilot Customer 01'),
  ('SC-BLR-DEL-CUSTOMER-02', 'Pilot Customer 02'),
  ('SC-BLR-DEL-CUSTOMER-03', 'Pilot Customer 03'),
  ('SC-BLR-DEL-CUSTOMER-04', 'Pilot Customer 04'),
  ('SC-BLR-DEL-CUSTOMER-05', 'Pilot Customer 05')
) AS demo(customer_ref, customer_name)
ON CONFLICT (external_ref) DO NOTHING;

INSERT INTO products (sku, name, category, unit_value, weight_kg, eligible_for_rematch)
VALUES
  ('SC-PILOT-BLR-DEL-01', 'Pilot earbuds', 'Electronics', 4149, 0.280, TRUE),
  ('SC-PILOT-BLR-DEL-02', 'Pilot e-reader', 'Electronics', 11619, 0.350, TRUE),
  ('SC-PILOT-BLR-DEL-03', 'Pilot desk lamp', 'Household', 2034, 1.150, TRUE),
  ('SC-PILOT-BLR-DEL-04', 'Pilot running shoes', 'Apparel', 9130, 0.920, FALSE),
  ('SC-PILOT-BLR-DEL-05', 'Pilot water bottle', 'Household', 2449, 0.600, TRUE)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO hubs (code, name, pincode, capacity, occupied_slots)
VALUES
  ('SC-PILOT-BLR1', 'Bengaluru Origin Hub (Synthetic Pilot)', '560001', 6, 0),
  ('SC-PILOT-DEL1', 'Delhi Destination Hub (Synthetic Pilot)', '110001', 6, 0)
ON CONFLICT (code) DO NOTHING;

INSERT INTO orders (
  order_number, customer_id, product_id, current_status, quantity,
  order_value, destination_pincode
)
SELECT demo.order_number, customers.customer_id, products.product_id,
       demo.current_status::order_status, 1, demo.order_value, '110001'
FROM (VALUES
  ('SC-BLR-DEL-0001', 'SC-BLR-DEL-CUSTOMER-01', 'SC-PILOT-BLR-DEL-01', 'HELD', 4149),
  ('SC-BLR-DEL-0002', 'SC-BLR-DEL-CUSTOMER-02', 'SC-PILOT-BLR-DEL-02', 'HELD', 11619),
  ('SC-BLR-DEL-0003', 'SC-BLR-DEL-CUSTOMER-03', 'SC-PILOT-BLR-DEL-03', 'OUT_FOR_DELIVERY', 2034),
  ('SC-BLR-DEL-0004', 'SC-BLR-DEL-CUSTOMER-04', 'SC-PILOT-BLR-DEL-04', 'DISPATCHED', 9130),
  ('SC-BLR-DEL-0005', 'SC-BLR-DEL-CUSTOMER-05', 'SC-PILOT-BLR-DEL-05', 'HELD', 2449)
) AS demo(order_number, customer_ref, sku, current_status, order_value)
JOIN customers ON customers.external_ref = demo.customer_ref
JOIN products ON products.sku = demo.sku
ON CONFLICT (order_number) DO NOTHING;

INSERT INTO parcels (
  parcel_number, order_id, status, current_hub_id, seal_intact,
  damaged, irreversibility_score, hold_until
)
SELECT demo.parcel_number, orders.order_id,
       demo.parcel_status::parcel_status, hubs.hub_id, TRUE, FALSE,
       demo.irreversibility_score,
       CASE WHEN demo.hold_hours IS NULL THEN NULL
            ELSE now() + demo.hold_hours * interval '1 hour'
       END
FROM (VALUES
  ('SC-BLR-DEL-PARCEL-0001', 'SC-BLR-DEL-0001', 'HELD', 78, 18),
  ('SC-BLR-DEL-PARCEL-0002', 'SC-BLR-DEL-0002', 'HELD', 82, 42),
  ('SC-BLR-DEL-PARCEL-0003', 'SC-BLR-DEL-0003', 'OUT_FOR_DELIVERY', 91, NULL),
  ('SC-BLR-DEL-PARCEL-0004', 'SC-BLR-DEL-0004', 'IN_TRANSIT', 74, NULL),
  ('SC-BLR-DEL-PARCEL-0005', 'SC-BLR-DEL-0005', 'HELD', 69, 30)
) AS demo(parcel_number, order_number, parcel_status, irreversibility_score, hold_hours)
JOIN orders ON orders.order_number = demo.order_number
JOIN hubs ON hubs.code = 'SC-PILOT-DEL1'
ON CONFLICT (parcel_number) DO NOTHING;

INSERT INTO demand_signals (
  pincode, product_id, orders_last_30d, open_orders, cart_count, demand_score
)
SELECT '110001', product_id, demo.orders_last_30d, demo.open_orders,
       demo.cart_count, demo.demand_score
FROM (VALUES
  ('SC-PILOT-BLR-DEL-01', 8, 2, 3, 0.62),
  ('SC-PILOT-BLR-DEL-02', 6, 1, 2, 0.54),
  ('SC-PILOT-BLR-DEL-03', 4, 1, 2, 0.48),
  ('SC-PILOT-BLR-DEL-04', 3, 0, 1, 0.31),
  ('SC-PILOT-BLR-DEL-05', 5, 1, 2, 0.51)
) AS demo(sku, orders_last_30d, open_orders, cart_count, demand_score)
JOIN products ON products.sku = demo.sku
ON CONFLICT (pincode, product_id) DO NOTHING;

INSERT INTO cancellation_events (
  idempotency_key, order_id, parcel_id, source, reason, stage_at_cancel,
  occurred_at, received_at, payload
)
SELECT demo.idempotency_key, orders.order_id, parcels.parcel_id, 'OPERATOR',
       'DEMO - synthetic Bangalore to Delhi pilot cancellation',
       parcels.status, now() - demo.age, now() - demo.age,
       jsonb_build_object(
         'demo', TRUE,
         'pilot_id', 'BLR_DELHI_5',
         'origin_city', 'Bengaluru',
         'destination_city', 'Delhi',
         'road_distance_km_one_way', 2150,
         'distance_source', 'Planning estimate; not live routing or carrier telemetry'
       )
FROM (VALUES
  ('smartcancy-blr-delhi-5-1', 'SC-BLR-DEL-0001', interval '25 minutes'),
  ('smartcancy-blr-delhi-5-2', 'SC-BLR-DEL-0002', interval '21 minutes'),
  ('smartcancy-blr-delhi-5-3', 'SC-BLR-DEL-0003', interval '17 minutes'),
  ('smartcancy-blr-delhi-5-4', 'SC-BLR-DEL-0004', interval '13 minutes'),
  ('smartcancy-blr-delhi-5-5', 'SC-BLR-DEL-0005', interval '9 minutes')
) AS demo(idempotency_key, order_number, age)
JOIN orders ON orders.order_number = demo.order_number
JOIN parcels ON parcels.order_id = orders.order_id
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO decisions (
  event_id, selected_action, status, recovery_score, model_confidence,
  policy_status, approval_mode, scoring_version, reasoning_summary, tool_trace
)
SELECT events.event_id, demo.action::recovery_action,
       demo.status::decision_status, demo.score, demo.confidence,
       'SYNTHETIC_PILOT', 'HUMAN_REVIEW', 'rules-v1',
       demo.reason,
       jsonb_build_object('demo', TRUE, 'execution_performed', FALSE)
FROM (VALUES
  ('smartcancy-blr-delhi-5-1', 'HOLD', 'REVIEW_REQUIRED', 72, 0.74, 'Synthetic case: held parcel requires operator review.'),
  ('smartcancy-blr-delhi-5-2', 'HOLD', 'APPROVED', 78, 0.82, 'Synthetic case: held parcel approved for continued hold.'),
  ('smartcancy-blr-delhi-5-3', 'TRANSFER', 'REVIEW_REQUIRED', 61, 0.71, 'Synthetic case: last-mile transfer requires operator review.'),
  ('smartcancy-blr-delhi-5-4', 'CONTINUE', 'RECOMMENDED', 80, 0.86, 'Synthetic case: continuing in transit is recommended for review.'),
  ('smartcancy-blr-delhi-5-5', 'HOLD', 'PROCESSING', NULL, NULL, 'Synthetic case: awaiting recovery evaluation.')
) AS demo(idempotency_key, action, status, score, confidence, reason)
JOIN cancellation_events events
  ON events.idempotency_key = demo.idempotency_key
ON CONFLICT (event_id) DO NOTHING;

COMMIT;
