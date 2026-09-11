 /**
     * 2BOT-NEW 设备状态感知中继 (Serverless Telemetry Relay)
     * 专为 Vercel 优化设计 (兼容 Vercel 预解析与直接访问)
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

      // 2. 根路径探活（允许浏览器免鉴权直接打开验证，查看运行状态）
      if (normMethod === 'GET' && (normPath === '/' || normPath === '')) {
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

      // 3. 校验 x-device-token 鉴权头（严格保护 /push 与 /pull）
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

      // 4. 处理 POST /push (手机端上报设备状态)
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

      // 5. 处理 GET /pull (NAS 2BOT 拉取最新设备状态)
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

      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Endpoint not found' })
      };
    }

    /**
     * Vercel Serverless Function 原生导出入口 (全面异步化，杜绝流死锁)
     */
    module.exports = async (req, res) => {
      try {
        let body = req.body;

        // 仅在 POST 且 Vercel 未解析 body 时安全流式读取
        if (!body && (req.method === 'POST' || req.method === 'PUT')) {
          body = await new Promise((resolve) => {
            let chunk = '';
            req.on('data', c => { chunk += c; });
            req.on('end', () => resolve(chunk));
            req.on('error', () => resolve(null));
          });
        }

        const resObj = handleRelayRequest(req.method, req.url, req.headers, body);
        for (const [k, v] of Object.entries(resObj.headers)) {
          res.setHeader(k, v);
        }
        res.statusCode = resObj.statusCode;
        res.end(resObj.body);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    };
