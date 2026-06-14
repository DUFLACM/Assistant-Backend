import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import { routes } from './routes.js';
import { sendJson, sendNoContent } from './utils/response.js';
import { parseJsonBody } from './utils/request.js';

const port = Number(process.env.PORT || 3000);

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

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

    // 支持 redirect 响应（302 跳转，用于 CAS 登录等场景）
    if (payload.redirect) {
      res.writeHead(302, { Location: payload.redirect });
      res.end();
      return;
    }

    sendJson(res, payload.status || 200, {
      code: payload.code || 'OK',
      message: payload.message || 'success',
      data: payload.data ?? null,
    });
  } catch (error) {
    console.error('[server] error:', error.message);
    sendJson(res, error.status || 500, {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || '服务器内部错误',
    });
  }
});

server.listen(port, () => {
  console.log(`DUFL ACM backend running at http://localhost:${port}`);
});
