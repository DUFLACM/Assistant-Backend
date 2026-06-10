import {
  createContestSignup,
  getContest,
  getMember,
  listContestSignups,
  listLocalContests,
} from '../data/db.js';
import { buildRanking } from '../services/pointsService.js';
import { getRemoteContestList } from '../services/contestService.js';
import { badRequest, notFound } from '../utils/errors.js';

function attachSignupState(list, memberId) {
  const member = getMember(memberId);

  return list.map((contest) => {
    const signedMembers = listContestSignups(contest.id);
    const isSigned = member ? signedMembers.some((signup) => signup.memberId === member.id) : false;

    return {
      ...contest,
      signups: (contest.signups || 0) + signedMembers.length,
      isSigned,
    };
  });
}

export async function listContests({ query }) {
  const remoteContests = await getRemoteContestList();
  const localContests = listLocalContests().map((contest) => ({
    ...contest,
    source: contest.source || 'local',
  }));
  const list = attachSignupState([...localContests, ...remoteContests], query.memberId);
  const mine = query.memberId ? list.filter((contest) => contest.isSigned) : [];

  return {
    data: {
      featured: list[0],
      list,
      mine,
      ranking: buildRanking(),
      process: ['发布通知', '在线报名', '冻结积分', '名单公示', '确认组队', '赛后归档'],
    },
  };
}

export function applyContest({ params, body }) {
  const contest = getContest(params.contestId);

  if (!contest) {
    throw notFound('暂不支持直接报名外部同步赛事，请等待管理员发布校内报名入口');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  const member = getMember(body.memberId);

  if (!member) {
    throw notFound('成员不存在');
  }

  const existingSignup = listContestSignups(params.contestId).find((item) => item.memberId === member.id);

  if (existingSignup) {
    return {
      message: '已报名',
      data: existingSignup,
    };
  }

  const signup = createContestSignup(params.contestId, member.id, body);

  return {
    status: 201,
    message: '报名已提交',
    data: signup,
  };
}
