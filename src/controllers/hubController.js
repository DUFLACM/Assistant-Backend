import { listActivities, listPointLogs } from '../data/db.js';
import { buildRanking, getMemberPointSummary } from '../services/pointsService.js';

const defaultMemberId = '10001';

export function getHubSummary({ query }) {
  const memberId = query.memberId || defaultMemberId;
  const summary = getMemberPointSummary(memberId);
  const ranking = buildRanking();
  const activities = listActivities();
  const pointLogs = listPointLogs(memberId);

  return {
    data: {
      memberId,
      points: summary.effectivePoints,
      rank: summary.rank,
      monthRawPoints: summary.monthRawPoints,
      pendingTasks: [
        { id: 'task-checkin', title: '成员大会签到', meta: '18:50 截止', status: '待完成' },
        { id: 'task-contest', title: '周赛报名确认', meta: '周六 19:30', status: '报名中' },
        { id: 'task-solution', title: '补交题解链接', meta: '可获得 4 积分', status: '待审核' },
      ],
      recentActivities: activities.slice(0, 2),
      notices: [
        { id: 'notice-points', title: '4 月积分公示', desc: '公示期剩余 32 小时，可提交申诉' },
        { id: 'notice-icpc', title: 'ICPC 网络赛拟推荐名单', desc: '冻结积分已锁定，候补顺序已生成' },
      ],
      latestPointLogs: pointLogs.slice(0, 4),
      ranking: ranking.slice(0, 5),
    },
  };
}
