/**
 * 2BOT-NEW 设备状态感知中继 (Serverless Telemetry Relay)
 * 纯原生 Node.js 实现 (0 外部 npm 依赖)，专为阿里云函数计算 FC 3.0 / 自建轻量中继设计
 * 
 * 核心特性：
 * 1. 内存中原子暂存最新设备状态快照（单实例生命周期无感驻留）
 * 2. POST /push : 接收手机 Tasker/MacroDroid 推送的设备状态 JSON
 * 3. GET /pull  : 供 NAS 端 2BOT 插件拉取最新设备状态数据
 * 4. 校验请求头 x-device-token，非法请求 100% 阻断返回 401 Unauthorized
 * 5. 内置标准 CORS 头与 OPTIONS 预检支持，方便远程调试
 * 6. 双模兼容：原生支持阿里云 FC 3.0 内置 Node.js 20 运行时（Event/HTTP 自动适配）与本地独立运行
 */

const http = require('http');

// 内存中最新设备状态快照与接收时间戳（原子级内存缓存）
let latestDeviceState = null;
let lastUpdatedAt = null;

// 从环境变量读取鉴权 Token，默认提供占位缺省值
const EXPECTED_TOKEN = process.env.DEVICE_TOKEN || 'your_device_token_here';

// 标准 CORS 响应头
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-token',
  'Content-Type': 'application/json; charset=utf-8'
};

/**
 * 核心请求处理逻辑
 * @param {string} method HTTP 方法 (GET, POST, OPTIONS 等)
 * @param {string} rawPath 请求路径 (/push, /pull 等)
 * @param {object} headers 请求头对象
 * @param {string|object} body 请求体内容
 * @returns {object} { statusCode, headers, body }
 */
function handleRelayRequest(method, rawPath, headers = {}, body = null) {
  const normMethod = (method || 'GET').toUpperCase();
  const normPath = (rawPath || '/').split('?')[0];

  // 1. 处理 OPTIONS 预检请求 (CORS)
  if (normMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // 2. 校验 x-device-token 鉴权头（不区分大小写）
  let clientToken = '';
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === 'x-device-token') {
      clientToken = headers[key];
      break;
    }
  }

  if (!clientToken || clientToken !== EXPECTED_TOKEN) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: 'Unauthorized: missing or invalid x-device-token header'
      })
    };
  }

  // 3. 处理 POST /push (手机端上报设备状态)
  if (normMethod === 'POST' && normPath.endsWith('/push')) {
    try {
      let payload = body;
      if (typeof payload === 'string') {
        payload = JSON.parse(payload);
      }
      if (!payload || typeof payload !== 'object') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: false, error: 'Invalid JSON payload in request body' })
        };
      }

      // 原子更新内存快照与时间戳
      latestDeviceState = {
        ...payload,
        _received_at: new Date().toISOString()
      };
      lastUpdatedAt = Date.now();

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          message: 'Telemetry updated successfully',
          received_at: latestDeviceState._received_at
        })
      };
    } catch (err) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: `JSON parse error: ${err.message}` })
      };
    }
  }

  // 4. 处理 GET /pull (NAS 2BOT 拉取最新设备状态)
  if (normMethod === 'GET' && normPath.endsWith('/pull')) {
    if (!latestDeviceState) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          data: null,
          message: 'No telemetry data received yet'
        })
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: true,
        data: latestDeviceState,
        updated_at: lastUpdatedAt
      })
    };
  }

  // 5. 默认根路径探活
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      status: 'ok',
      service: '2bot-device-telemetry-relay',
      hasData: Boolean(latestDeviceState),
      lastUpdated: lastUpdatedAt
    })
  };
}

/**
 * 阿里云 FC 3.0 入口函数 (内置运行时 Node.js 20 HTTP 触发器支持)
 */
exports.handler = async (event, context) => {
  // 如果作为传统 Node.js (req, resp) 触发器被调用
  if (event && typeof event.setHeader === 'function') {
    return new Promise((resolve) => {
      const req = event;
      const resp = context;
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', () => {
        const resObj = handleRelayRequest(req.method, req.url, req.headers, bodyData);
        for (const [k, v] of Object.entries(resObj.headers)) {
          resp.setHeader(k, v);
        }
        resp.setStatusCode ? resp.setStatusCode(resObj.statusCode) : (resp.statusCode = resObj.statusCode);
        resp.send ? resp.send(resObj.body) : resp.end(resObj.body);
        resolve();
      });
    });
  }

  // FC 3.0 标准 HTTP 触发器事件结构 (event 为对象或 JSON 字符串)
  let eventObj = event;
  if (typeof event === 'string') {
    try { eventObj = JSON.parse(event); } catch { eventObj = {}; }
  }

  const rawPath = eventObj.rawPath || eventObj.path || '/';
  const method = eventObj.requestContext?.http?.method || eventObj.httpMethod || 'GET';
  const headers = eventObj.headers || {};
  let body = eventObj.body || null;

  if (eventObj.isBase64Encoded && typeof body === 'string') {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  return handleRelayRequest(method, rawPath, headers, body);
};

// 支持本地独立运行与快速验证：node tools/serverless-relay/index.js
if (require.main === module) {
  const PORT = process.env.PORT || 9099;
  const server = http.createServer((req, res) => {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', () => {
      const resObj = handleRelayRequest(req.method, req.url, req.headers, bodyData);
      res.writeHead(resObj.statusCode, resObj.headers);
      res.end(resObj.body);
    });
  });

  server.listen(PORT, () => {
    console.log(`[Serverless Relay] 🚀 本地调试服务已启动: http://127.0.0.1:${PORT}`);
    console.log(`[Serverless Relay] 🔑 当前预设鉴权 Token: ${EXPECTED_TOKEN}`);
    console.log(`[Serverless Relay] 📡 推送端点: POST http://127.0.0.1:${PORT}/push`);
    console.log(`[Serverless Relay] 📥 拉取端点: GET  http://127.0.0.1:${PORT}/pull`);
  });
}
