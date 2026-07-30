// AMU TUNE サーバー - 静的ファイル配信 + CORSプロキシ を8080で統合
// http-server の代わりにこちらを使う
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const STATIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.ico':  'image/x-icon',
    '.mp3':  'audio/mpeg',
    '.json': 'application/json',
};

const server = http.createServer((req, res) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
    };

    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);

    // ============================================================
    // /proxy?url=... → CORSプロキシ
    // ============================================================
    if (parsedUrl.pathname === '/proxy') {
        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            res.writeHead(400, corsHeaders);
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
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
                'Accept': '*/*',
                'Referer': 'https://suno.com/',
                'Origin': 'https://suno.com',
            }
        };

        const proxyReq = lib.request(options, (proxyRes) => {
            console.log(`[Proxy] Response: ${proxyRes.statusCode}`);
            const headers = Object.assign({}, corsHeaders, {
                'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
            });
            if (proxyRes.headers['content-length']) {
                headers['Content-Length'] = proxyRes.headers['content-length'];
            }
            res.writeHead(proxyRes.statusCode, headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('[Proxy Error]', err.message);
            res.writeHead(502, corsHeaders);
            res.end('Proxy error: ' + err.message);
        });

        proxyReq.end();
        return;
    }

    // ============================================================
    // 静的ファイル配信
    // ============================================================
    let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
    filePath = path.join(STATIC_DIR, filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, corsHeaders);
            res.end('Not found: ' + filePath);
            return;
        }
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, Object.assign({}, corsHeaders, { 'Content-Type': contentType }));
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`AMU TUNE Server running at http://localhost:${PORT}`);
    console.log(`Static files from: ${STATIC_DIR}`);
    console.log(`CORS Proxy available at: http://localhost:${PORT}/proxy?url=...`);
});
