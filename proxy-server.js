// AMU TUNE CORS Proxy Server - Port 8081
// Sunoの cdn1.suno.ai など外部MP3をCORS回避でダウンロードするためのシンプルなプロキシ
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8081;

const server = http.createServer((req, res) => {
    // CORS ヘッダーを全許可
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const targetUrl = parsedUrl.query.url;

    if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing ?url= parameter');
        return;
    }

    console.log(`[Proxy] Fetching: ${targetUrl}`);

    const target = url.parse(targetUrl);
    const lib = target.protocol === 'https:' ? https : http;

    const options = {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.path,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': '*/*',
            'Referer': 'https://suno.com/'
        }
    };

    const proxyReq = lib.request(options, (proxyRes) => {
        const statusCode = proxyRes.statusCode;
        console.log(`[Proxy] Response: ${statusCode} for ${targetUrl}`);

        res.writeHead(statusCode, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
            'Content-Length': proxyRes.headers['content-length'] || ''
        });
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('[Proxy Error]', err.message);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Proxy error: ' + err.message);
    });

    proxyReq.end();
});

server.listen(PORT, () => {
    console.log(`AMU TUNE CORS Proxy running at http://localhost:${PORT}`);
    console.log(`Usage: http://localhost:${PORT}/proxy?url=https://cdn1.suno.ai/[uuid].mp3`);
});
