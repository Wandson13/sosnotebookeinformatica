import {createRemoteJWKSet, jwtVerify} from 'jose';
import storeWorker from './server.mjs';

const keySets = new Map();
function remoteKeys(issuer) {
  if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)));
  return keySets.get(issuer);
}

export function createCloudflareHandler(getKeys = remoteKeys) {
  return {async fetch(request, env) {
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) if (name.startsWith('oai-')) headers.delete(name);
    const token = headers.get('Cf-Access-Jwt-Assertion') || headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
    let authenticated = false;
    if (token && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && env.ADMIN_EMAIL) {
      const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
      if (/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) {
        try {
          const {payload} = await jwtVerify(token, getKeys(issuer), {issuer, audience:env.ACCESS_AUD, algorithms:['RS256'], requiredClaims:['exp','iat','sub','email']});
          authenticated = typeof payload.email === 'string' && payload.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
          if (authenticated) {
            headers.set('oai-authenticated-user-id', payload.sub);
            headers.set('oai-authenticated-user-email', payload.email);
          }
        } catch { /* Invalid or expired sessions never authorize administration. */ }
      }
    }
    const path = new URL(request.url).pathname;
    if (path === '/admin/login') {
      if (authenticated) return new Response(null, {status:302, headers:{Location:'/admin.html','Cache-Control':'no-store'}});
      return new Response('O acesso administrativo ainda não foi configurado ou sua conta não está autorizada.', {status:403});
    }
    if (path === '/api/session') return Response.json({authenticated, local:false, provider:'cloudflare', loginUrl:'/admin/login', logoutUrl:'/cdn-cgi/access/logout'}, {headers:{'Cache-Control':'no-store'}});
    return storeWorker.fetch(new Request(request, {headers}), {...env, LOCAL_PREVIEW:false});
  }};
}

export default createCloudflareHandler();
