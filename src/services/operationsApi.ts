import { MOCK_EVENTS } from '../data/operationsMock';
import type { CancellationEvent } from '../types/operations';
// Replace this adapter with fetch calls when the separately-owned backend endpoints are available.
export const operationsApi = {
  source: 'DETERMINISTIC MOCK ADAPTER' as const,
  async listEvents(): Promise<CancellationEvent[]> { return structuredClone(MOCK_EVENTS); },
  async updateStatus(id: string, status: CancellationEvent['status']): Promise<CancellationEvent> {
    const event = MOCK_EVENTS.find((item) => item.id === id);
    if (!event) throw new Error('Cancellation event not found');
    return { ...event, status };
  },
};
