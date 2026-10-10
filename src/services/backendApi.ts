const API_ROOT = '/api';

export interface CancellationRecord {
  event_id: string;
  source: string;
  reason: string;
  event_status: string;
  stage_at_cancel: string;
  received_at: string;
  order_number: string;
  order_status: string;
  order_value: number | string | null;
  destination_pincode: string | null;
  parcel_number: string | null;
  parcel_status: string | null;
  decision_id: string | null;
  decision_status: string | null;
  selected_action: string | null;
  recovery_score: number | string | null;
}

export interface CancellationReport {
  pagination: { limit: number; offset: number; total: number };
  cancellations: CancellationRecord[];
}

export interface OverviewMetrics {
  total_cancellations: number | string;
  received_events: number | string;
  processing_decisions: number | string;
  recommended_decisions: number | string;
  decisions_requiring_review: number | string;
  recorded_impact_records: number | string;
  recorded_cost_saved: number | string;
  recorded_distance_avoided_km: number | string;
  recorded_carbon_avoided_kg: number | string;
}

export interface CancellationResponse {
  event_id: string;
  status: string;
  decision_status: string;
  duplicate: boolean;
}

export interface DecisionReport {
  decision: {
    decision_id: string;
    status: string;
    selected_action: string | null;
    recovery_score: number | string | null;
    model_confidence: number | string | null;
    reasoning_summary: string | null;
    scoring_version: string | null;
  };
  candidates: Array<{
    action: string;
    feasible: boolean;
    reason: string;
    estimated_cost: number | string | null;
    estimated_distance_km: number | string | null;
    estimated_carbon_kg: number | string | null;
    score: number | string | null;
  }>;
  impact: {
    cost_saved: number | string | null;
    distance_avoided_km: number | string | null;
    carbon_avoided_kg: number | string | null;
  } | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const responseText = await response.text();
  let body: unknown;

  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`Backend API unavailable (${response.status} ${response.statusText}). Start the backend and check its database configuration.`);
    }
    throw new Error('Backend API returned an invalid response.');
  }

  if (!response.ok) {
    if (response.status === 502) {
      throw new Error('Backend API is unreachable. Start it on port 8000 and check its PostgreSQL configuration.');
    }
    const errorBody = body && typeof body === 'object'
      ? body as { error?: string; message?: string }
      : {};
    throw new Error(errorBody.message || errorBody.error || `Request failed (${response.status})`);
  }

  return body as T;
}

export const backendApi = {
  listCancellations: () =>
    request<CancellationReport>('/v1/reports/cancellations?limit=100'),

  getOverview: () =>
    request<{ metrics: OverviewMetrics; impact_note: string }>('/v1/reports/overview'),

  getDecision: (decisionId: string) =>
    request<DecisionReport>(`/v1/reports/decisions/${encodeURIComponent(decisionId)}`),

  createCancellation: (input: {
    order_number: string;
    reason: string;
    source: 'CUSTOMER_APP' | 'CUSTOMER_SUPPORT' | 'SYSTEM' | 'OPERATOR';
  }) => {
    const idempotencyKey = crypto.randomUUID();
    return request<CancellationResponse>('/v1/cancellations', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
  },

  evaluateRecovery: (eventId: string) =>
    request<{ status: string; selected_action: string | null }>(
      `/v1/recovery/${encodeURIComponent(eventId)}/evaluate`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  approveDecision: (decisionId: string) =>
    request<{ status: string }>(`/v1/approvals/${encodeURIComponent(decisionId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'OPERATOR' }),
    }),

  rejectDecision: (decisionId: string) =>
    request<{ status: string }>(`/v1/approvals/${encodeURIComponent(decisionId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'OPERATOR' }),
    }),

  executeDecision: (decisionId: string) =>
    request<{ mode: string; real_side_effects: boolean }>(
      `/v1/executions/${encodeURIComponent(decisionId)}/execute`,
      { method: 'POST', body: JSON.stringify({ actor: 'OPERATOR' }) },
    ),
};
