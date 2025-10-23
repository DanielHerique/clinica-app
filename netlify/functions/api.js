const GAS_BASE = "https://script.google.com/macros/s/AKfycbyh3YoV7WOCcC80KLTuaCQsXM-JrP9UryY2FTjVXuFMgdicjB-FrPzeKWsH5-c0tMWX/exec";
const MEMO = new Map(); // key -> { ts, status, body }
const TTL_MS = 20000;   // 20s

export async function handler(event) {
  try {
    const { httpMethod, queryStringParameters, body } = event;
    const qs = new URLSearchParams(queryStringParameters || {}).toString();
    const target = `${GAS_BASE}?${qs}`;
    const key = `${httpMethod}:${target}`;

    // cache apenas para GET
    if (httpMethod === "GET") {
      const hit = MEMO.get(key);
      if (hit && Date.now() - hit.ts < TTL_MS) {
        return {
          statusCode: hit.status,
          headers: hdrs(),
          body: hit.body,
        };
      }
    }

    const init = { method: httpMethod, headers: { "Content-Type": "application/json" } };
    if (httpMethod !== "GET" && httpMethod !== "HEAD" && body) init.body = body;

    const r = await fetch(target, init);
    const text = await r.text();

    if (httpMethod === "GET" && r.ok) {
      MEMO.set(key, { ts: Date.now(), status: r.status, body: text });
    }

    return { statusCode: r.status, headers: hdrs(), body: text };
  } catch (err) {
    return { statusCode: 500, headers: hdrs(), body: JSON.stringify({ ok: false, error: String(err) }) };
  }
}

function hdrs() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
