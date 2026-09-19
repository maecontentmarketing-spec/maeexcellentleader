// ============================================================
// EL002 这边的小型代理 API：把「查询我自己的COT名单」请求转送到
// landing page 的数据库（只通过一个受暗号保护的小功能读取），
// 前端只呼叫这个function（同一个网站，相对路径
// /.netlify/functions/my-cot-leads，不用处理CORS）。
//
// 为什么要经过这个function：EL002本身是纯前端静态网站，
// 如果把暗号直接写进index.html，任何人打开浏览器开发者工具
// 都能看到。暗号只存在这里（Netlify环境变数），浏览器永远看不到。
//
// 流程：
//   1) 检查这个 agent_code 确实是 EL002 里的真实 Member ID
//      （所以 KATE、测试代码之类查不到任何东西）
//   2) 带上暗号，呼叫 landing page 数据库里的
//      get_agent_leads_for_el002(p_code, p_secret)
//   3) 只回传：日期、姓名、电话、城市（不含 email）
//
// 用到的环境变数（在 Netlify 后台 Site configuration ->
// Environment variables 设置，绝对不要写进程式码或 GitHub）：
//   AGENT_LEADS_API_KEY   与 landing page 数据库 private_secrets 表里
//                         el002_leads_secret 相同的暗号
// ============================================================

// 下面两组都是「公开钥匙」(publishable/anon)，本来就写在网页里，不是秘密。
const EL002_SUPABASE_URL = "https://oyxkyglfrmqcbqwbkjvy.supabase.co";
const EL002_SUPABASE_KEY = "sb_publishable_BcZO5Pp3MHJ_0Ti4MKO0ZQ_DozkqBeg";
const LANDING_SUPABASE_URL = "https://ltdoqcycrrriztcacbyj.supabase.co";
const LANDING_SUPABASE_KEY = "sb_publishable_6P34O-j2gwumy1F24pjxhw_NoLSnnp-";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (statusCode, obj) => ({ statusCode, headers: JSON_HEADERS, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Method not allowed. Use POST." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return reply(400, { error: "Invalid JSON body." });
  }

  const agentCode = (payload.agent_code || "").toString().trim().toUpperCase().slice(0, 40);
  if (!agentCode) return reply(400, { error: "agent_code is required." });
  // Only letters, digits and "-" — also keeps the member lookup below safe.
  if (!/^[A-Z0-9-]+$/.test(agentCode)) return reply(200, { leads: [] });

  const secret = process.env.AGENT_LEADS_API_KEY;
  if (!secret) {
    return reply(500, { error: "Server misconfigured: AGENT_LEADS_API_KEY not set." });
  }

  try {
    // 1) Must be a real EL002 member.
    const memberResp = await fetch(
      `${EL002_SUPABASE_URL}/rest/v1/students?select=member_id&member_id=eq.${encodeURIComponent(agentCode)}&limit=1`,
      { headers: { apikey: EL002_SUPABASE_KEY } }
    );
    if (!memberResp.ok) return reply(502, { error: "Failed to check member." });
    const members = await memberResp.json();
    if (!Array.isArray(members) || members.length === 0) return reply(200, { leads: [] });

    // 2) Ask the landing page database (protected by the secret).
    const leadsResp = await fetch(`${LANDING_SUPABASE_URL}/rest/v1/rpc/get_agent_leads_for_el002`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: LANDING_SUPABASE_KEY },
      body: JSON.stringify({ p_code: agentCode, p_secret: secret })
    });
    if (!leadsResp.ok) return reply(502, { error: "Failed to reach landing page data." });
    const rows = await leadsResp.json();

    // 3) Minimal fields only.
    const leads = (Array.isArray(rows) ? rows : []).map(r => ({
      created_at: r.created_at, name: r.name, phone: r.phone, city: r.city
    }));
    return reply(200, { leads });
  } catch (err) {
    return reply(502, { error: "Failed to reach landing page API." });
  }
};
