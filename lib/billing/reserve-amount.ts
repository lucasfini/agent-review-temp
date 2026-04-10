export type ReservationWorkflowType =
  | 'upload_processing'
  | 'content_generation'
  | 'analysis_job'
  | 'coverage_analysis'
  | 'segment_touchup';

const RESERVE_MULTIPLIERS: Record<ReservationWorkflowType, number> = {
  upload_processing: 1.05,
  content_generation: 1.0,
  analysis_job: 1.02,
  coverage_analysis: 1.05,
  segment_touchup: 1.05,
};

export function estimateReservationAmount(
  estimatedCost: number,
  workflowType: ReservationWorkflowType
): number {
  const normalizedCost = Number(Math.max(0, estimatedCost).toFixed(4));
  if (normalizedCost <= 0) return 0;

  const multiplier = RESERVE_MULTIPLIERS[workflowType] ?? 1.05;
  return Number((normalizedCost * multiplier).toFixed(4));
}
