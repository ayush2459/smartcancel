-- SmartCancy PostgreSQL schema bootstrap.
-- Schema only: no seed/customer data, credentials, or secrets.
-- Apply only to a fresh, dedicated SmartCancy database. Never to FlowSense.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE order_status AS ENUM ('PLACED','CONFIRMED','PICKING','PACKED','DISPATCHED','OUT_FOR_DELIVERY','CANCELLATION_REQUESTED','HELD','RE_MATCHED','DELIVERED','CANCELLED','RETURNING','RETURNED','REVIEW_REQUIRED');
CREATE TYPE parcel_status AS ENUM ('CREATED','PICKING','PACKED','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','HELD','RE_MATCHED','DELIVERED','RETURNING','RETURNED','CANCELLED');
CREATE TYPE cancellation_source AS ENUM ('CUSTOMER_APP','CUSTOMER_SUPPORT','SYSTEM','OPERATOR');
CREATE TYPE recovery_action AS ENUM ('STOP','HOLD','CONTINUE','RE_MATCH','TRANSFER','RETURN');
CREATE TYPE decision_status AS ENUM ('PROCESSING','RECOMMENDED','REVIEW_REQUIRED','APPROVED','REJECTED','EXECUTING','EXECUTED','FAILED','FALLBACK');
CREATE TYPE execution_status AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','ROLLED_BACK');
CREATE TYPE hub_status AS ENUM ('ACTIVE','DEGRADED','OFFLINE');
CREATE TYPE rider_status AS ENUM ('AVAILABLE','ON_ROUTE','AT_HUB','OFFLINE');

CREATE TABLE customers (
 customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), external_ref VARCHAR(100) UNIQUE NOT NULL,
 name VARCHAR(150) NOT NULL, segment VARCHAR(50), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE products (
 product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sku VARCHAR(100) UNIQUE NOT NULL,
 name VARCHAR(255) NOT NULL, category VARCHAR(100), unit_value NUMERIC(12,2) NOT NULL CHECK(unit_value>=0),
 weight_kg NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK(weight_kg>=0), perishable BOOLEAN NOT NULL DEFAULT FALSE,
 customized BOOLEAN NOT NULL DEFAULT FALSE, eligible_for_rematch BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE hubs (
 hub_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(150) NOT NULL,
 pincode VARCHAR(20) NOT NULL, latitude NUMERIC(9,6), longitude NUMERIC(9,6),
 capacity INTEGER NOT NULL CHECK(capacity>0), occupied_slots INTEGER NOT NULL DEFAULT 0 CHECK(occupied_slots>=0),
 status hub_status NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(occupied_slots<=capacity)
);
CREATE TABLE riders (
 rider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(150) NOT NULL,
 hub_id UUID REFERENCES hubs(hub_id), status rider_status NOT NULL DEFAULT 'AVAILABLE',
 latitude NUMERIC(9,6), longitude NUMERIC(9,6), capacity INTEGER NOT NULL DEFAULT 4 CHECK(capacity>0),
 active_load INTEGER NOT NULL DEFAULT 0 CHECK(active_load>=0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(active_load<=capacity)
);
CREATE TABLE orders (
 order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_number VARCHAR(50) UNIQUE NOT NULL,
 customer_id UUID NOT NULL REFERENCES customers(customer_id), product_id UUID NOT NULL REFERENCES products(product_id),
 current_status order_status NOT NULL DEFAULT 'PLACED', quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>0),
 order_value NUMERIC(12,2) NOT NULL CHECK(order_value>=0), destination_pincode VARCHAR(20) NOT NULL,
 destination_latitude NUMERIC(9,6), destination_longitude NUMERIC(9,6),
 delivery_window_start TIMESTAMPTZ, delivery_window_end TIMESTAMPTZ, version INTEGER NOT NULL DEFAULT 1,
 placed_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE routes (
 route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), route_code VARCHAR(50) UNIQUE NOT NULL,
 hub_id UUID NOT NULL REFERENCES hubs(hub_id), rider_id UUID REFERENCES riders(rider_id),
 status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE', remaining_km NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(remaining_km>=0),
 remaining_stops INTEGER NOT NULL DEFAULT 0 CHECK(remaining_stops>=0), eta TIMESTAMPTZ, version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE route_stops (
 route_stop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), route_id UUID NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
 order_id UUID REFERENCES orders(order_id), sequence_no INTEGER NOT NULL CHECK(sequence_no>0),
 status VARCHAR(40) NOT NULL DEFAULT 'PENDING', planned_latitude NUMERIC(9,6), planned_longitude NUMERIC(9,6),
 UNIQUE(route_id,sequence_no)
);
CREATE TABLE parcels (
 parcel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), parcel_number VARCHAR(50) UNIQUE NOT NULL,
 order_id UUID NOT NULL UNIQUE REFERENCES orders(order_id), status parcel_status NOT NULL DEFAULT 'CREATED',
 current_hub_id UUID REFERENCES hubs(hub_id), current_route_id UUID REFERENCES routes(route_id),
 current_rider_id UUID REFERENCES riders(rider_id), seal_intact BOOLEAN NOT NULL DEFAULT TRUE,
 damaged BOOLEAN NOT NULL DEFAULT FALSE, irreversibility_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(irreversibility_score BETWEEN 0 AND 100),
 hold_until TIMESTAMPTZ, version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE cancellation_events (
 event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key VARCHAR(150) UNIQUE NOT NULL,
 order_id UUID NOT NULL REFERENCES orders(order_id), parcel_id UUID REFERENCES parcels(parcel_id),
 source cancellation_source NOT NULL, reason VARCHAR(100) NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'RECEIVED',
 stage_at_cancel parcel_status NOT NULL, nudge_shown BOOLEAN NOT NULL DEFAULT FALSE,
 customer_kept_order BOOLEAN NOT NULL DEFAULT FALSE, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(), payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE demand_signals (
 demand_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), pincode VARCHAR(20) NOT NULL,
 product_id UUID NOT NULL REFERENCES products(product_id), orders_last_30d INTEGER NOT NULL DEFAULT 0 CHECK(orders_last_30d>=0),
 open_orders INTEGER NOT NULL DEFAULT 0 CHECK(open_orders>=0), cart_count INTEGER NOT NULL DEFAULT 0 CHECK(cart_count>=0),
 demand_score NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK(demand_score BETWEEN 0 AND 1),
 observed_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(pincode,product_id)
);
CREATE TABLE decisions (
 decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), event_id UUID NOT NULL UNIQUE REFERENCES cancellation_events(event_id),
 selected_action recovery_action, status decision_status NOT NULL DEFAULT 'PROCESSING',
 recovery_score NUMERIC(8,5), model_confidence NUMERIC(8,5), policy_status VARCHAR(40), approval_mode VARCHAR(30),
 scoring_version VARCHAR(50) NOT NULL DEFAULT 'recovery-v1', reasoning_summary TEXT,
 tool_trace JSONB NOT NULL DEFAULT '[]'::jsonb, input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE recovery_candidates (
 candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), decision_id UUID REFERENCES decisions(decision_id) ON DELETE CASCADE,
 action recovery_action NOT NULL, feasible BOOLEAN NOT NULL DEFAULT FALSE, reason TEXT,
 estimated_cost NUMERIC(12,2), estimated_distance_km NUMERIC(10,2), estimated_carbon_kg NUMERIC(10,3),
 risk_score NUMERIC(6,3), sla_risk_score NUMERIC(6,3), score NUMERIC(8,5), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE executions (
 execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), decision_id UUID NOT NULL REFERENCES decisions(decision_id),
 action recovery_action NOT NULL, status execution_status NOT NULL DEFAULT 'PENDING', actor VARCHAR(100) NOT NULL,
 expected_version INTEGER, actual_version INTEGER, error_code VARCHAR(100), error_message TEXT,
 started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE impact_ledger (
 impact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), decision_id UUID NOT NULL UNIQUE REFERENCES decisions(decision_id),
 baseline_cost NUMERIC(12,2) NOT NULL DEFAULT 0, optimized_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
 cost_saved NUMERIC(12,2) NOT NULL DEFAULT 0, baseline_distance_km NUMERIC(10,2) NOT NULL DEFAULT 0,
 optimized_distance_km NUMERIC(10,2) NOT NULL DEFAULT 0, distance_avoided_km NUMERIC(10,2) NOT NULL DEFAULT 0,
 baseline_carbon_kg NUMERIC(10,3) NOT NULL DEFAULT 0, optimized_carbon_kg NUMERIC(10,3) NOT NULL DEFAULT 0,
 carbon_avoided_kg NUMERIC(10,3) NOT NULL DEFAULT 0, baseline_handling_events INTEGER NOT NULL DEFAULT 0,
 optimized_handling_events INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
 audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), event_id UUID REFERENCES cancellation_events(event_id),
 decision_id UUID REFERENCES decisions(decision_id), execution_id UUID REFERENCES executions(execution_id),
 actor VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, from_state VARCHAR(60), to_state VARCHAR(60),
 details JSONB NOT NULL DEFAULT '{}'::jsonb, correlation_id VARCHAR(150), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE scenario_runs (
 scenario_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), scenario_code VARCHAR(50) NOT NULL,
 scenario_name VARCHAR(150) NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'READY', seed INTEGER,
 snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status ON orders(current_status);
CREATE INDEX idx_parcels_status ON parcels(status);
CREATE INDEX idx_parcels_hub ON parcels(current_hub_id);
CREATE INDEX idx_routes_rider ON routes(rider_id);
CREATE INDEX idx_routes_hub ON routes(hub_id);
CREATE INDEX idx_cancellation_order ON cancellation_events(order_id);
CREATE INDEX idx_cancellation_received ON cancellation_events(received_at);
CREATE INDEX idx_decisions_status ON decisions(status);
CREATE INDEX idx_audit_event ON audit_events(event_id);
CREATE INDEX idx_audit_decision ON audit_events(decision_id);
CREATE INDEX idx_demand_lookup ON demand_signals(pincode,product_id);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
 NEW.updated_at = now();
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER parcels_updated_at BEFORE UPDATE ON parcels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER routes_updated_at BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER decisions_updated_at BEFORE UPDATE ON decisions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
