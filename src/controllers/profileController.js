import { getMember, listPointLogs } from '../data/db.js';
import { getMemberPointSummary } from '../services/pointsService.js';
import { notFound } from '../utils/errors.js';

export function getProfile({ params }) {
  const member = getMember(params.memberId);

  if (!member) {
    throw notFound('成员不存在');
  }

  const points = getMemberPointSummary(member.id);

  return {
    data: {
      ...member,
      points,
      pointLogs: listPointLogs(member.id),
      adminEntrances: [
        { id: 'member', label: '成员管理' },
        { id: 'activity', label: '活动管理' },
        { id: 'points', label: '积分审核' },
        { id: 'audit', label: '操作日志' },
      ],
    },
  };
}
