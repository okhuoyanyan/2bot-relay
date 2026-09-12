# 📡 2BOT 云端状态中继服务 (`2bot-relay`) 使用说明与部署手册

> **核心定位**：专为 **2BOT-NEW 双智能体管家系统** 与 **2BOT 手机伴侣端 (`2bot-companion`)** 量身打造的专属 Serverless 云端通信临时信箱。  
> 纯原生 Node.js 实现，**0 外部 npm 依赖**，支持 **Vercel / 阿里云 FC / 自建服务器** 永久 0 元免费托管。

---

## 📖 目录
1. [🌟 为什么需要云端中继？（解决的核心痛点）](#-为什么需要云端中继解决的核心痛点)
2. [🔄 系统交互架构图](#-系统交互架构图)
3. [🚀 极速部署指南（推荐 Vercel 1 分钟免运维上线）](#-极速部署指南推荐-vercel-1-分钟免运维上线)
4. [📱 手机伴侣端配置指引 (`2bot-companion`)](#-手机伴侣端配置指引-2bot-companion)
5. [🏡 家中 NAS / 2BOT 机器人端配置指引](#-家中-nas--2bot-机器人端配置指引)
6. [🛠️ API 接口规范与调试手册](#-api-接口规范与调试手册)
7. [🔒 隐私与安全性保障](#-隐私与安全性保障)
8. [❓ 常见问题排查 (FAQ)](#-常见问题排查-faq)

---

## 🌟 为什么需要云端中继？（解决的核心痛点）

在智能体管家日常运行中，我们需要让家里的机器人随时感知主人的起居体征与时空状态（如：是否到家、是否就寝充电、当前运动步数、位置经纬度等）。但这面临两大网络现实困境：

1. **跨局域网通信屏障**：
   - 手机经常处于外部环境（移动 4G/5G、公司 WiFi、通勤途中），此时无法直接访问家中 NAS 的局域网内网 IP（如 `192.168.50.197`）。
2. **NAS 暴露公网的安全与耗电隐患**：
   - 如果直接在路由器将 NAS 内部端口全量 DMZ 映射到公网供手机长连，存在公网端口暴露风险；且手机在移动过程中频繁在基站与 WiFi 间切换，直连长连接会频繁断开并重连，极度消耗手机电量。

### 💡 解决方案：“云端临时信箱”
- **手机端只管“投信”**：手机状态改变（充放电插拔、网络切换、定时器到达）时，发起极轻量的单次 HTTP POST 请求，将状态投入中继信箱；
- **云端只管“暂存”**：Vercel 毫秒级冷启动，原子化保存在最新切片中，无需数据库，0 存储成本；
- **NAS 端只管“取信”**：家里的 2BOT 在需要推演时（如脉搏主动问候、早晚安推演）主动向中继信箱拉取一次，双方均无需对外暴露监听端口！

---

## 🔄 系统交互架构图

```
 +---------------------------------------------------------+
 |             📱 手机端 (2bot-companion)                  |
 |  - 充放电插拔即时触发                                    |
 |  - WiFi / 蜂窝切换即时触发                               |
 |  - 前台常驻保活定时保底                                  |
 +----------------------------+----------------------------+
                              |
                              | 1. POST /push (带 Token 鉴权)
                              v
 +---------------------------------------------------------+
 |            ☁️ 云端信箱 (2bot-relay on Vercel)           |
 |  - 24 小时全球 CDN 免费高可用                            |
 |  - 仅原子保留最新 1 份物理切片 (绝不泄露历史轨迹)        |
 +----------------------------+----------------------------+
                              ^
                              | 2. GET /pull (带 Token 鉴权)
                              |
 +----------------------------+----------------------------+
 |             🏡 家中 NAS (2BOT-NEW 机器人服务端)         |
 |  - 脉搏系统主动苏醒拉取                                  |
 |  - 时空状态引擎推演 (是否在家 / 起居熟睡 / 亮屏活跃)      |
 +---------------------------------------------------------+
```

---

## 🚀 极速部署指南（推荐 Vercel 1 分钟免运维上线）

### 方案 A：Vercel 托管（最推荐，永久免费、免运维）
1. 注册并登录 [Vercel 官网](https://vercel.com/)；
2. 点击 **「Add New...」** -> **「Project」**；
3. 选择从 GitHub 导入您的 `2bot-relay` 仓库；
4. **配置环境变量（关键安全项）**：
   - 展开 **Environment Variables**；
   - 增加环境变量：
     - **Key**：`DEVICE_TOKEN`
     - **Value**：`你自定义的高强度私密密钥`（例如：`my_super_token_8848`）
5. 点击 **「Deploy」**，等待 10 秒即可部署完成！
6. Vercel 会自动为您分配免费域名，格式如：
   `https://your-2bot-relay.vercel.app`

---

### 方案 B：阿里云函数计算 FC 3.0（国内网络友好备选）
1. 登录 [阿里云函数计算控制台](https://fcnext.console.aliyun.com/)；
2. 创建函数 -> 选择 **Web 函数** -> 运行环境选择 **`Node.js 20`**；
3. 将仓库中的 `index.js` 复制粘贴到在线编辑器中；
4. 在「环境配置」中添加环境变量 `DEVICE_TOKEN`；
5. 点击部署，复制系统分配的二级公网地址（`https://xxxx.fcapp.run`）。

---

### 方案 C：本地或私有 VPS 独立运行
无需任何第三方依赖，纯原生 Node.js 启动：
```bash
# 克隆仓库
git clone https://github.com/okhuoyanyan/2bot-relay.git
cd 2bot-relay

# 自定义端口与 Token 运行 (默认监听 9099 端口)
PORT=9099 DEVICE_TOKEN=my_super_token_8848 node index.js
```

---

## 📱 手机伴侣端配置指引 (`2bot-companion`)

1. 打开 Android 手机上的 **2BOT 伴侣** APP；
2. 往下滑动至 **【云端通信与中继设置】** 卡片；
3. 填入参数：
   - **云端中继服务 URL**：填入您的部署地址（例如 `https://your-2bot-relay.vercel.app`，无需后缀 `/push`，客户端会自动补齐）；
   - **设备私有鉴权 Token**：填入您在环境变量中设置的 `DEVICE_TOKEN`；
   - **状态同步心跳频率**：推荐设置为 `15` 分钟。
4. 点击 **【保存并测试连接】**；
5. 点击上方 **【立即测试上报一次】**，若弹出 `上报成功！(HTTP 200)`，则证明手机与云端中继已成功贯通！

---

## 🏡 家中 NAS / 2BOT 机器人端配置指引

打开 2BOT-NEW 服务端配置文件 `config/config.json`，确保包含如下 `deviceTelemetry` 配置块：

```json
"deviceTelemetry": {
  "enabled": true,
  "mode": "serverless",
  "serverless": {
    "pullUrl": "https://your-2bot-relay.vercel.app/pull",
    "token": "你自定义的高强度私密密钥",
    "timeoutMs": 3000
  },
  "home_ssids": [
    "RainLain_5G",
    "HOMES-5G"
  ],
  "staleness_timeout_minutes": 60
}
```

- **`pullUrl`**：中继的 `/pull` 地址；
- **`token`**：与中继一致的鉴权 Token；
- **`home_ssids`**：您的家庭 WiFi 名称列表（当手机连上其中任意一个时，系统会自动推演为您“位于家中”）；
- **`staleness_timeout_minutes`**：数据失鲜超时（默认 60 分钟，若手机超 1 小时未上报，推演会自动降级为“位置不确定”，绝不瞎猜）。

---

## 🛠️ API 接口规范与调试手册

### 1. 根路径探活 (`GET /`)
- **权限**：开放，支持直接使用浏览器访问验证服务是否存活。
- **响应示例**：
  ```json
  {
    "status": "ok",
    "service": "2bot-device-telemetry-relay",
    "hasData": true,
    "lastUpdated": 1789181728175
  }
  ```

### 2. 手机端上报 (`POST /push`)
- **Headers**：
  - `Content-Type: application/json`
  - `x-device-token: <你的私有Token>`
- **Body**：设备遥测 JSON（包含 `battery`、`wifi`、`location`、`stepsToday` 等）
- **响应**：`{ "ok": true, "message": "Telemetry updated successfully", "received_at": "..." }`

### 3. 机器人端拉取 (`GET /pull`)
- **Headers**：
  - `x-device-token: <你的私有Token>`
- **响应示例**：
  ```json
  {
    "ok": true,
    "data": {
      "battery": { "level": 45, "isCharging": true },
      "wifi": { "connected": true, "ssid": "HOMES-5G" },
      "location": { "latitude": 23.123995, "longitude": 113.239424, "accuracy": 30, "provider": "network" },
      "screenLocked": false,
      "foregroundApp": "2bot-companion",
      "stepsToday": 52,
      "screenTimeMinutes": 112,
      "nextAlarm": { "formatted": "明天 00:00" }
    },
    "updated_at": 1789181728175
  }
  ```

---

## 🔒 隐私与安全性保障

1. **强行鉴权防御**：所有 `/push` 与 `/pull` 操作必须携带正确的 `x-device-token`，任何未经授权的探测一律直接返回 `401 Unauthorized`；
2. **纯内存原子覆盖，零磁盘存储**：中继在生命周期内仅在内存保留最新的 **1 份设备状态快照**，绝不记录任何历史轨迹数据库，从根源上杜绝历史隐私泄露风险；
3. **数据主权完全归属个人**：整套系统完全基于用户自建的开源仓库运行，绝不经过任何第三方公有商业服务器。

---

## ❓ 常见问题排查 (FAQ)

### Q1：手机点击测试上报提示 `HTTP 401` 是什么原因？
- **A**：说明手机 APP 中填写的 Token 与 Vercel 环境变量中配置的 `DEVICE_TOKEN` 不一致。请检查手机端与 Vercel 控制台中的字符串是否完全匹配。

### Q2：Vercel 免费版的用量够用吗？
- **A**：完全足够且永远用不完。Vercel 免费个人版提供每月高达 100,000 次无服务器调用和大量带宽；按照每 15 分钟上报一次计算，一个月仅需调用约 2,880 次，仅占免费额度的不足 3%。

### Q3：为什么浏览器打开 `/pull` 提示 `401 Unauthorized`？
- **A**：因为 `/pull` 接口受到私有 Token 严格保护，浏览器直接点击访问不带 `x-device-token` 请求头，所以被系统安全拦截。这是安全机制生效的正常表现。如需查看服务运行状态，请直接访问根路径 `https://your-2bot-relay.vercel.app/`。