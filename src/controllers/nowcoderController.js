import { getMember as findMember, getPlatformAccount, upsertPlatformAccount } from '../data/db.js';
import { badRequest, notFound, tooManyRequests } from '../utils/errors.js';

const UPDATE_LIMIT_PER_DAY = 5;
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

async function assertMember(memberId) {
  const member = await findMember(memberId);

  if (!member) {
    throw notFound('成员不存在');
  }

  return member;
}

function getDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTodayUpdates(account, now = Date.now()) {
  const today = getDayKey(new Date(now));

  return (account?.updateLogs || []).filter((timestamp) => getDayKey(new Date(timestamp)) === today);
}

function assertCanUpdate(account) {
  if (!account) {
    return;
  }

  const now = Date.now();
  const latestUpdateAt = account.updateLogs?.[account.updateLogs.length - 1] || 0;
  const waitMs = UPDATE_INTERVAL_MS - (now - latestUpdateAt);

  if (waitMs > 0) {
    const waitMinutes = Math.ceil(waitMs / 60000);
    throw tooManyRequests(`更新间隔为 10 分钟，请 ${waitMinutes} 分钟后再试`);
  }

  if (getTodayUpdates(account, now).length >= UPDATE_LIMIT_PER_DAY) {
    throw tooManyRequests('今日牛客更新次数已用完');
  }
}

function normalizeUid(uid = '') {
  return String(uid).trim();
}

function assertUid(uid) {
  if (!uid) {
    throw badRequest('请输入牛客用户 ID');
  }

  if (!/^\d+$/.test(uid)) {
    throw badRequest('牛客用户 ID 只能包含数字');
  }
}

function serializeAccount(account) {
  if (!account) {
    return {
      bound: false,
      uid: '',
      rating: null,
      joinedContests: 0,
      updatedAt: null,
      updatesLeftToday: UPDATE_LIMIT_PER_DAY,
    };
  }

  const updatesToday = getTodayUpdates(account).length;

  return {
    bound: true,
    uid: account.uid,
    nickname: account.nickname || account.teamName || account.uid,
    rating: account.rating ?? null,
    joinedContests: account.joinedContests ?? 0,
    latestContestName: account.latestContestName || '',
    updatedAt: account.updatedAt,
    updatesLeftToday: Math.max(UPDATE_LIMIT_PER_DAY - updatesToday, 0),
  };
}

async function fetchNowcoderUser(uid) {
  const url = new URL('https://ac.nowcoder.com/acm-heavy/acm/contest/profile/contest-joined-history');

  url.searchParams.set('token', '');
  url.searchParams.set('uid', uid);
  url.searchParams.set('onlyJoinedFilter', 'true');
  url.searchParams.set('searchContestName', '');
  url.searchParams.set('onlyRatingFilter', 'false');
  url.searchParams.set('contestEndFilter', 'true');

  const response = await fetch(url, {
    headers: {
      'user-agent': 'DUFLACM-Assistant/0.1',
      accept: 'application/json',
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.code !== 0) {
    throw badRequest(payload?.msg || '牛客用户不存在或接口暂不可用');
  }

  const dataList = payload.data?.dataList || [];
  const latest = dataList[0] || {};
  const pageInfo = payload.data?.pageInfo || {};

  return {
    uid,
    rating: latest.rating ?? null,
    joinedContests: pageInfo.totalCount ?? dataList.length,
    nickname: latest.teamName || `用户${uid}`,
    latestContestName: latest.contestName || '',
  };
}

async function refreshAccount(memberId, uid) {
  const member = await assertMember(memberId);
  const existingAccount = await getPlatformAccount(member.id, 'nowcoder');

  assertCanUpdate(existingAccount);

  const user = await fetchNowcoderUser(uid);
  const now = Date.now();
  const updateLogs = [...getTodayUpdates(existingAccount, now), now];

  const account = await upsertPlatformAccount(member.id, 'nowcoder', user.uid, {
    ...user,
    updatedAt: new Date(now).toISOString(),
  }, updateLogs);

  return serializeAccount(account);
}

export async function getNowcoderAccount({ params }) {
  const member = await assertMember(params.memberId);

  return {
    data: serializeAccount(await getPlatformAccount(member.id, 'nowcoder')),
  };
}

export async function bindNowcoderAccount({ body, params }) {
  await assertMember(params.memberId);

  const uid = normalizeUid(body?.uid);
  assertUid(uid);

  return {
    data: await refreshAccount(params.memberId, uid),
  };
}

export async function updateNowcoderAccount({ params }) {
  const member = await assertMember(params.memberId);

  const account = await getPlatformAccount(member.id, 'nowcoder');

  if (!account) {
    throw badRequest('请先绑定牛客用户 ID');
  }

  return {
    data: await refreshAccount(params.memberId, account.uid),
  };
}
