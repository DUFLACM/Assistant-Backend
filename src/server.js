import http from 'node:http';
import { URL } from 'node:url';
import { routes } from './routes.js';
import { sendJson, sendNoContent } from './utils/response.js';
import { parseJsonBody } from './utils/request.js';

const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendNoContent(res);
    return;
  }

  const route = routes.find((item) => item.method === req.method && item.pattern.test(requestUrl.pathname));

  if (!route) {
    sendJson(res, 404, {
      code: 'NOT_FOUND',
      message: '接口不存在',
    });
    return;
  }

  try {
    const match = requestUrl.pathname.match(route.pattern);
    const params = route.keys.reduce((result, key, index) => {
      result[key] = decodeURIComponent(match[index + 1]);
      return result;
    }, {});
    const body = await parseJsonBody(req);

    const payload = await route.handler({
      body,
      headers: req.headers,
      params,
      query: Object.fromEntries(requestUrl.searchParams.entries()),
    });

    sendJson(res, payload.status || 200, {
      code: payload.code || 'OK',
      message: payload.message || 'success',
      data: payload.data ?? null,
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || '服务器内部错误',
    });
  }
});

server.listen(port, () => {
  console.log(`DUFL ACM backend running at http://localhost:${port}`);
});
