import { getMemberPointSummary } from '../services/pointsService.js';

export function getPointsPreview({ params }) {
  const summary = getMemberPointSummary(params.memberId);

  return {
    data: {
      formula: 'E = M0 + 0.85*M1 + 0.70*M2 + 0.55*M3 + 0.40*M4 + 0.25*M5',
      ...summary,
    },
  };
}
