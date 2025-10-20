// netlify/functions/api.js
const GAS_BASE = "https://script.google.com/macros/s/AKfycbyh3YoV7WOCcC80KLTuaCQsXM-JrP9UryY2FTjVXuFMgdicjB-FrPzeKWsH5-c0tMWX/exec";

export default async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const qs = url.search || "";
    const target = GAS_BASE + qs;

    // Configuração da requisição
    const init = {
      method: req.method,
      redirect: "manual", // <---- NÃO seguir redirect automático
      headers: { "Content-Type": "application/json" },
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const raw = Buffer.concat(chunks).toString() || "{}";
      init.body = raw;
    }

    // Executa requisição
    const r = await fetch(target, init);

    // Se o GAS retornou um redirect (302), segue manualmente
    if (r.status === 302) {
      const redirectUrl = r.headers.get("location");
      const follow = await fetch(redirectUrl);
      const data = await follow.text();

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      return res.status(200).send(data);
    }

    // Caso normal
    const text = await r.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();

    return res.status(r.status).send(text);
  } catch (err) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ ok: false, error: String(err) });
  }
};
