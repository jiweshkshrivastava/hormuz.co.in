// Hormuz — Cloudflare Worker
// Serves index.html and adds permissive CSP so all external APIs work

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const newResponse = new Response(response.body, response);
    newResponse.headers.set(
      'Content-Security-Policy',
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *;"
    );
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    return newResponse;
  }
};
