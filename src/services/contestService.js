const CODEFORCES_CONTEST_URL = 'https://codeforces.com/api/contest.list?gym=false';

const fallbackCodeforcesContests = [
  {
    id: 'cf-2233',
    title: 'Educational Codeforces Round 191 (Rated for Div. 2)',
    type: 'CF',
    status: '报名中',
    date: '2026-06-09 22:35',
    freezeAt: '比赛开始前 30 分钟',
    signups: 0,
    source: 'fallback',
  },
  {
    id: 'cf-2232',
    title: 'Codeforces Round (Div. 2)',
    type: 'CF',
    status: '报名中',
    date: '2026-05-30 22:35',
    freezeAt: '比赛开始前 30 分钟',
    signups: 0,
    source: 'fallback',
  },
];

function pad(value) {
  return `${value}`.padStart(2, '0');
}

function formatDateTime(timestampSeconds) {
  const date = new Date(timestampSeconds * 1000);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeCodeforcesContest(contest) {
  return {
    id: `cf-${contest.id}`,
    title: contest.name,
    type: contest.type || 'CF',
    status: contest.phase === 'BEFORE' ? '报名中' : '进行中',
    date: formatDateTime(contest.startTimeSeconds),
    freezeAt: '比赛开始前 30 分钟',
    signups: 0,
    source: 'codeforces',
    startTimeSeconds: contest.startTimeSeconds,
    durationSeconds: contest.durationSeconds,
  };
}

export async function getRemoteContestList() {
  try {
    const response = await fetch(CODEFORCES_CONTEST_URL);
    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.status !== 'OK') {
      return fallbackCodeforcesContests;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    return (payload.result || [])
      .filter((contest) => {
        const endSeconds = contest.startTimeSeconds + contest.durationSeconds;

        return contest.startTimeSeconds && contest.durationSeconds && endSeconds > nowSeconds;
      })
      .map(normalizeCodeforcesContest)
      .sort((a, b) => b.startTimeSeconds - a.startTimeSeconds)
      .slice(0, 20);
  } catch {
    return fallbackCodeforcesContests;
  }
}
