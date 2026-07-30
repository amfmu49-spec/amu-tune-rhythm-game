// AMU TUNE - Cloudflare Worker CORS Proxy Server
// 完全無料・超高速・ドメイン制限セキュリティ付き CORS プロキシ
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const urlParams = new URL(request.url).searchParams;
    const targetUrlStr = urlParams.get("url");

    if (!targetUrlStr) {
      return new Response("Missing ?url= parameter", { status: 400 });
    }

    try {
      const targetUrl = new URL(targetUrlStr);
      // セキュリティ保護: Suno関連のドメインのみプロキシを許可（不正悪用・スパム防止）
      const allowedDomains = ["cdn1.suno.ai", "cdn2.suno.ai", "audio.suno.com", "suno.ai", "suno.com"];
      const isAllowed = allowedDomains.some(domain => targetUrl.hostname.endsWith(domain));

      if (!isAllowed) {
        return new Response("Forbidden: Target domain is not permitted.", { status: 403 });
      }

      const res = await fetch(targetUrlStr, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Referer": "https://suno.com/",
          "Origin": "https://suno.com"
        }
      });

      const responseHeaders = new Headers(res.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");

      return new Response(res.body, {
        status: res.status,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response("Proxy Error: " + err.message, { status: 502 });
    }
  }
};
