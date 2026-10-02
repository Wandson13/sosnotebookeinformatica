import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {createCloudflareHandler} from '../cloudflare.mjs';

test('Cloudflare accepts only signed owner sessions for the configured application', async () => {
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey); key.kid = 'test';
  const worker = createCloudflareHandler(() => createLocalJWKSet({keys:[key]}));
  const env = {ADMIN_EMAIL:'owner@example.test', ACCESS_TEAM_DOMAIN:'shop.cloudflareaccess.com', ACCESS_AUD:'shop-admin', ASSETS:{fetch:() => new Response('asset')}};
  const sign = (email, audience='shop-admin', expiration='1h') => new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('owner').setIssuer('https://shop.cloudflareaccess.com').setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey);
  const session = async headers => (await worker.fetch(new Request('https://shop.test/api/session',{headers}),env)).json();
  assert.equal((await session({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':env.ADMIN_EMAIL})).authenticated,false);
  assert.equal((await session({'Cf-Access-Jwt-Assertion':'forged'})).authenticated,false);
  assert.equal((await session({'Cf-Access-Jwt-Assertion':await sign(env.ADMIN_EMAIL)})).authenticated,true);
  assert.equal((await session({Cookie:`CF_Authorization=${await sign(env.ADMIN_EMAIL)}`})).authenticated,true);
  assert.equal((await session({'Cf-Access-Jwt-Assertion':await sign('visitor@example.test')})).authenticated,false);
  assert.equal((await session({'Cf-Access-Jwt-Assertion':await sign(env.ADMIN_EMAIL,'other-app')})).authenticated,false);
  assert.equal((await session({'Cf-Access-Jwt-Assertion':await sign(env.ADMIN_EMAIL,'shop-admin',1)})).authenticated,false);
  const forbidden = await worker.fetch(new Request('https://shop.test/api/admin/store',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':env.ADMIN_EMAIL}}),env);
  assert.equal(forbidden.status,403);
  assert.equal((await worker.fetch(new Request('https://shop.test/admin/login'),env)).status,403);
});
