# DUFL ACM Assistant Back End

Node.js backend for the DUFL ACM 算法协会微信小程序.

The backend uses Node built-in modules plus the built-in `node:sqlite` module, so it does not require `npm install`.

Requires Node.js 24+.

## Run

```bash
cd da-back-end
npm run start
```

Development mode:

```bash
npm run dev
```

Default server:

```text
http://localhost:3000
```

You can change the port with:

```bash
PORT=4000 npm run start
```

## APIs

```text
GET  /api/health
GET  /api/hub?memberId=10001
GET  /api/activities
GET  /api/activity-tags
POST /api/activity-tags
POST /api/activities/:activityId/signup
POST /api/activities/:activityId/checkin
POST /api/activities/:activityId/leave
POST /api/activities/:activityId/material
PUT  /api/activities/:activityId/points-rule
GET  /api/contests
POST /api/contests/:contestId/signup
GET  /api/members/:memberId/profile
GET  /api/members/:memberId/points-preview
```

Example check-in request:

```bash
curl -X POST http://localhost:3000/api/activities/act-cf-1000/checkin \
  -H 'Content-Type: application/json' \
  -d '{"memberId":"10001","mode":"dynamic-code"}'
```

Example activity points-rule update:

```bash
curl -X PUT http://localhost:3000/api/activities/act-training-dp/points-rule \
  -H 'Content-Type: application/json' \
  -d '{"memberId":"10001","basePoints":2,"validSubmitBonus":3,"materialBonus":1,"requireValidSubmit":true,"requireMaterial":true}'
```

Example contest signup:

```bash
curl -X POST http://localhost:3000/api/contests/contest-icpc-online/signup \
  -H 'Content-Type: application/json' \
  -d '{"memberId":"10001","language":"C++","obeyTeamAdjustment":true}'
```

## Database

SQLite is initialized automatically on server startup.

Default file:

```text
data/dufl-acm.sqlite
```

Override path:

```bash
SQLITE_PATH=/path/to/dufl-acm.sqlite npm run start
```

Member rules:

- `uid` is an integer primary key and starts at `10001`;
- `student_no` must be exactly 9 digits and is unique;
- legacy member ids such as `m-zhangsan` are kept only for backwards-compatible lookup.

## Structure

```text
src/server.js              HTTP server entry
src/routes.js              API route table
src/controllers/           Request handlers
src/services/              Business logic
src/services/contestService.js
                           Remote contest sync, currently Codeforces
src/data/db.js             SQLite schema, seed data, and data access
src/utils/                 Request, response, and error helpers
```

## Contest Query Rule

The miniprogram should not call Codeforces, Nowcoder, or other external contest APIs directly.

`GET /api/contests` is responsible for:

- reading local association-managed contests from SQLite;
- fetching public upcoming Codeforces contests on the server side;
- returning a merged contest list to the miniprogram;
- keeping signup writes limited to local association-managed contest IDs.

## Next Steps

- Add authentication based on WeChat login code and member binding.
- Add role-based permissions for activity, points, contest, and system administrators.
- Add publicity records and appeals.
