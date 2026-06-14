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
  const member = memberId ? getMember(memberId) : null;

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
  const localContests = (await listLocalContests()).map((contest) => ({
    ...contest,
    source: contest.source || 'local',
  }));
  const allContests = [...localContests, ...remoteContests];

  // Resolve signup state
  const member = query.memberId ? await getMember(query.memberId) : null;
  const list = [];
  for (const contest of allContests) {
    const signedMembers = await listContestSignups(contest.id);
    const isSigned = member ? signedMembers.some((signup) => signup.memberId === member.id) : false;
    list.push({
      ...contest,
      signups: (contest.signups || 0) + signedMembers.length,
      isSigned,
    });
  }
  const mine = query.memberId ? list.filter((contest) => contest.isSigned) : [];
  const ranking = await buildRanking();

  return {
    data: {
      featured: list[0],
      list,
      mine,
      ranking,
      process: ['发布通知', '在线报名', '冻结积分', '名单公示', '确认组队', '赛后归档'],
    },
  };
}

export async function applyContest({ params, body }) {
  const contest = await getContest(params.contestId);

  if (!contest) {
    throw notFound('暂不支持直接报名外部同步赛事，请等待管理员发布校内报名入口');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  const member = await getMember(body.memberId);

  if (!member) {
    throw notFound('成员不存在');
  }

  const existingSignups = await listContestSignups(params.contestId);
  const existingSignup = existingSignups.find((item) => item.memberId === member.id);

  if (existingSignup) {
    return {
      message: '已报名',
      data: existingSignup,
    };
  }

  const signup = await createContestSignup(params.contestId, member.id, body);

  return {
    status: 201,
    message: '报名已提交',
    data: signup,
  };
}
