// netlify/functions/api.js
const GAS_BASE = "https://script.google.com/macros/s/AKfycbyh3YoV7WOCcC80KLTuaCQsXM-JrP9UryY2FTjVXuFMgdicjB-FrPzeKWsH5-c0tMWX/exec";

export default async (req, res) => {
  try {
    // Remonta a URL do GAS com a query original (/api?... -> GAS?...).
    const url = new URL(req.url, `http://${req.headers.host}`);
    const qs = url.search ? url.search : "";
    const target = GAS_BASE + qs;

    // Encaminha método, body e headers "simples".
    const init = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      // Body já chega como string no Netlify; se precisar, usamos tal qual
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const raw = Buffer.concat(chunks).toString() || "{}";
      init.body = raw;
    }

    const r = await fetch(target, init);
    const text = await r.text(); // pode ser JSON; tratamos como texto para repassar 1:1

    // Devolve sempre JSON para o front e **com CORS liberado**.
    res.status(r.status).setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Pré-flight
    if (req.method === "OPTIONS") return res.status(204).end();

    return res.send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
};
