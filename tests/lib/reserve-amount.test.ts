import { estimateReservationAmount } from '@/lib/billing/reserve-amount';

describe('estimateReservationAmount', () => {
  test('keeps content generation reservations at the estimated cost', () => {
    expect(estimateReservationAmount(1.2345, 'content_generation')).toBe(1.2345);
  });

  test('uses a small upload buffer instead of a blanket 15 percent hold', () => {
    expect(estimateReservationAmount(10, 'upload_processing')).toBe(10.5);
  });

  test('returns zero for non-positive costs', () => {
    expect(estimateReservationAmount(0, 'analysis_job')).toBe(0);
    expect(estimateReservationAmount(-5, 'analysis_job')).toBe(0);
  });
});
