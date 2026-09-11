 /**
     * 2BOT-NEW 设备状态感知中继 (Serverless Telemetry Relay)
     * 专为 Vercel 永久免费 Serverless 托管优化设计 (0 外部 npm 依赖)
     */

    // 内存中最新设备状态快照与接收时间戳
    let latestDeviceState = null;
    let lastUpdatedAt = null;

    // 从环境变量读取鉴权 Token，默认提供缺省值
    const EXPECTED_TOKEN = process.env.DEVICE_TOKEN || 'telemetry_sec_8848';

    // 标准 CORS 响应头
    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-device-token',
      'Content-Type': 'application/json; charset=utf-8'
    };

    function handleRelayRequest(method, rawPath, headers = {}, body = null) {
      const normMethod = (method || 'GET').toUpperCase();
      const normPath = (rawPath || '/').split('?')[0];

      // 1. 处理 OPTIONS 预检请求 (CORS)
      if (normMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
      }

      // 2. 校验 x-device-token 鉴权头
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
          body: JSON.stringify({ ok: false, error: 'Unauthorized: missing or invalid x-device-token
  header' })
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
              body: JSON.stringify({ ok: false, error: 'Invalid JSON payload' })
            };
          }

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
            body: JSON.stringify({ ok: true, data: null, message: 'No telemetry data received yet' })
          };
        }

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, data: latestDeviceState, updated_at: lastUpdatedAt })
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
     * Vercel Serverless Function 原生导出入口
     */
    module.exports = (req, res) => {
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', () => {
        // 兼容已经解析好 req.body 的场景
        const effectiveBody = bodyData || req.body || null;
        const resObj = handleRelayRequest(req.method, req.url, req.headers, effectiveBody);
        for (const [k, v] of Object.entries(resObj.headers)) {
          res.setHeader(k, v);
        }
        res.statusCode = resObj.statusCode;
        res.end(resObj.body);
      });
    };
