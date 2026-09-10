// ============================================================
// EL002 这边的小型代理 API：把「查询我自己的COT名单」请求转送到
// landing page那边受保护的 agent-leads API，同时带上landing page
// 给的专属暗号（AGENT_LEADS_API_KEY）。
//
// 这一步存在的原因：EL002本身是纯前端静态网站，没有自己的后端。
// 如果直接把landing page给的暗号写进index.html里，任何打开浏览器
// 开发者工具的人都能看到这把钥匙，进而查到任何代理的名单——
// 这个function的作用就是避免这件事：暗号只存在这里（Netlify环境
// 变数），浏览器永远看不到，前端只呼叫这个function（同一个网站，
// 相对路径 /.netlify/functions/my-cot-leads，不用处理CORS）。
//
// 用到的环境变数（在 Netlify 后台 Site configuration ->
// Environment variables 设置，绝对不要写进程式码或 GitHub）：
//   AGENT_LEADS_API_KEY   landing page那边给的专属暗号
// ============================================================

const AGENT_LEADS_URL = "https://mae-global-landing.netlify.app/.netlify/functions/agent-leads";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed. Use POST." })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const agentCode = (payload.agent_code || "").toString().trim().toUpperCase().slice(0, 40);
  if (!agentCode) {
    return { statusCode: 400, body: JSON.stringify({ error: "agent_code is required." }) };
  }

  if (!process.env.AGENT_LEADS_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfigured: AGENT_LEADS_API_KEY not set." })
    };
  }

  try {
    const resp = await fetch(AGENT_LEADS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.AGENT_LEADS_API_KEY },
      body: JSON.stringify({ agent_code: agentCode })
    });
    const data = await resp.json();
    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Failed to reach landing page API." }) };
  }
};
