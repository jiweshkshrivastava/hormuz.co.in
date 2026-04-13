// Hormuz — Cloudflare Worker
// 1. Proxies APIs that don't have CORS headers (AMFI, Yahoo Finance, NSE)
// 2. Adds permissive CSP to all HTML responses so browser can call other APIs

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── API PROXY ROUTES ──────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(url);
    }

    // ── SERVE STATIC ASSETS ───────────────────────────
    const response = await env.ASSETS.fetch(request);
    const ct = response.headers.get('content-type') || '';

    // Only modify HTML responses
    if (!ct.includes('text/html')) return response;

    const newResponse = new Response(response.body, response);
    newResponse.headers.set(
      'Content-Security-Policy',
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *;"
    );
    return newResponse;
  }
};

async function handleAPI(url) {
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60'
  };

  const path = url.pathname;

  try {

    // ── NIFTY / ALL INDICES (Yahoo Finance) ──────────
    if (path === '/api/nifty') {
      const syms = ['^NSEI','^BSESN','^NSEBANK','^CNXIT','^NSEMDCP50','^INDIAVIX']
        .map(s => encodeURIComponent(s)).join(',');
      const r = await fetch(
        `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketPreviousClose`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
      );
      const d = await r.json();
      return new Response(JSON.stringify(d), { headers: CORS });
    }

    // ── AMFI NAV FEED ─────────────────────────────────
    if (path === '/api/amfi') {
      const r = await fetch('https://api.amfiindia.com/spages/NAVAll.txt');
      const text = await r.text();
      const lines = text.split('\n');
      const TARGETS = {
        'hdfc flexi cap fund': { id: 'nav-hdfc' },
        'parag parikh flexi cap fund': { id: 'nav-ppfas' },
        'mirae asset elss tax saver fund': { id: 'nav-mirae' },
        'mirae asset tax saver fund': { id: 'nav-mirae' },
        'axis small cap fund': { id: 'nav-axis' },
        'sbi nifty 50 index fund': { id: 'nav-sbinifty' },
      };
      const result = {};
      lines.forEach(line => {
        const parts = line.split(';');
        if (parts.length >= 5) {
          const name = (parts[3] || '').toLowerCase().trim();
          Object.entries(TARGETS).forEach(([key, val]) => {
            if (name.includes(key.split(' ').slice(0,3).join(' '))) {
              const nav = parseFloat(parts[4]);
              if (!isNaN(nav) && !result[val.id]) {
                result[val.id] = { name: parts[3], nav, date: parts[5] };
              }
            }
          });
        }
      });
      return new Response(JSON.stringify(result), { headers: CORS });
    }

    // ── NSE FII/DII ───────────────────────────────────
    if (path === '/api/nse-fiidii') {
      const r = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.nseindia.com/',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const d = await r.json();
      return new Response(JSON.stringify(d), { headers: CORS });
    }

    // ── NSE OPTION CHAIN ──────────────────────────────
    if (path === '/api/nse-oc') {
      const sym = url.searchParams.get('symbol') || 'NIFTY';
      const r = await fetch(`https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.nseindia.com/',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const d = await r.json();
      return new Response(JSON.stringify(d), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Unknown route' }), { status: 404, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS });
  }
}
