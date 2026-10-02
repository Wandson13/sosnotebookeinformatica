import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../server.mjs';
const profile={fullName:'Pessoa de Teste',cpf:'529.982.247-25',birthDate:'1995-05-20',gender:'not-informed',phone:'(99) 98115-0000',cep:'01001-000',state:'SP',city:'São Paulo',neighborhood:'Sé',street:'Praça da Sé',number:'10',complement:''};
test('Firebase: passwords leave CPU-limited Worker; sessions, ownership, migration and bans remain enforced',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const f of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const env={FIREBASE_API_KEY:'test-key',DB:{prepare(sql){return{bind(...args){return{async first(){return db.prepare(sql).get(...args)||null}}}}}},ASSETS:{fetch:()=>new Response('ok')}};
 t.mock.method(crypto.subtle,'deriveBits',()=>{throw Error('Password hashing must not run in Worker')});
 let uid='firebase-1',email='new@example.test',verified=false,providerError=null;
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.ok(String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:'));
  const action=String(url).split('accounts:')[1].split('?')[0],body=JSON.parse(options.body);calls.push({action,body});
  if(providerError)return Response.json({error:{message:providerError}},{status:400});
  if(action==='lookup')return Response.json({users:[{localId:uid,email,emailVerified:verified}]});
  if(action==='sendOobCode')return Response.json({email:body.email});
  return Response.json({localId:uid,email,idToken:'test-token',refreshToken:'must-not-leak'});
 });
 async function call(path,body,cookie='',origin='https://shop.test'){
  return worker.fetch(new Request('https://shop.test/api/members/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json','X-SOS-Member':'1',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})}),env);
 }
 let response=await call('register',{...profile,email,password:'safe-test-password'});assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict.*Secure/);
 const data=await response.json();assert.equal(data.idToken,undefined);assert.equal(data.refreshToken,undefined);
 const saved=db.prepare('SELECT * FROM members').get();assert.equal(saved.firebase_uid,uid);assert.equal(saved.password_hash,'firebase');assert.equal(saved.salt,'');
 assert.equal((await call('login',{email,password:'safe-test-password'})).status,200);
 assert.equal((await(await call('session',undefined,cookie)).json()).member.id,saved.id);
 providerError='INVALID_LOGIN_CREDENTIALS';assert.equal((await call('login',{email,password:'wrong-password'})).status,401);providerError=null;
 assert.equal((await call('login',{email,password:'safe-test-password'},'','https://evil.test')).status,403);
 db.prepare('UPDATE members SET banned=1 WHERE id=?').run(saved.id);
 assert.equal((await call('login',{email,password:'safe-test-password'})).status,403);
 assert.equal((await(await call('session',undefined,cookie)).json()).member,null);
 db.prepare('UPDATE members SET banned=0 WHERE id=?').run(saved.id);
 await call('logout',{},cookie);assert.equal((await(await call('session',undefined,cookie)).json()).member,null);
 // A changed provider UID must never inherit an already linked account.
 uid='different-uid';verified=true;assert.equal((await call('login',{email,password:'safe-test-password'})).status,409);
 email='legacy@example.test';uid='legacy-firebase';verified=false;
 db.prepare('INSERT INTO members(id,name,email,password_hash,salt,created_at,profile) VALUES(?,?,?,?,?,?,?)').run('legacy-id',profile.fullName,email,'old-hash','old-salt','2026-01-01',JSON.stringify(profile));
 db.prepare("INSERT INTO member_orders(id,member_id,request_key,items,total,status,created_at,updated_at) VALUES('old-order','legacy-id','old-request','[]',100,'completed','2026-01-01','2026-01-01')").run();
 assert.equal((await call('login',{email,password:'safe-test-password'})).status,403);
 assert.equal(db.prepare("SELECT firebase_uid FROM members WHERE id='legacy-id'").get().firebase_uid,null);
 assert.equal((await call('register',{...profile,email,password:'safe-test-password'})).status,409);
 response=await call('reset-password',{email});assert.equal(response.status,200);
 assert.ok(calls.some(x=>x.action==='signUp'&&x.body.email===email&&x.body.password.length>50));
 assert.ok(calls.some(x=>x.action==='sendOobCode'&&x.body.requestType==='PASSWORD_RESET'));
 verified=true;response=await call('login',{email,password:'new-safe-password'});assert.equal(response.status,200);assert.equal((await response.json()).member.id,'legacy-id');
 assert.equal(db.prepare("SELECT member_id FROM member_orders WHERE id='old-order'").get().member_id,'legacy-id');
 assert.equal(db.prepare("SELECT firebase_uid FROM members WHERE id='legacy-id'").get().firebase_uid,uid);
 // No profile overwrite during migration.
 assert.equal(JSON.parse(db.prepare("SELECT profile FROM members WHERE id='legacy-id'").get().profile).fullName,profile.fullName);
 providerError='CONFIGURATION_NOT_FOUND';assert.equal((await call('login',{email,password:'new-safe-password'})).status,503);
});
