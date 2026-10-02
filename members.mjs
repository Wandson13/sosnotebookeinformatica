import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256} from '@noble/hashes/sha2.js';
import {adminUsers} from './admin-users.mjs';
import {validateProfile} from './member-profile.mjs';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
async function passwordHash(password,salt,legacy=false){
 const bytes=new TextEncoder().encode(password),saltBytes=new TextEncoder().encode(salt);
 const key=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveBits']);
 try{return (legacy?'':'pbkdf2-sha256:100000:')+hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:legacy?600000:100000,hash:'SHA-256'},key,256))}
 catch(error){
  // Workers caps native PBKDF2 at 100,000 iterations. Preserve the existing
  // 600,000-iteration format using the same algorithm, never weaker hashes.
  if(error.name!=='NotSupportedError'||!/iteration/i.test(error.message))throw error;
  return hex(await pbkdf2Async(sha256,bytes,saltBytes,{c:600000,dkLen:32}));
 }
}
const equal=(a,b)=>{let diff=a.length^b.length;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0};
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
async function list(env,sql,...args){const row=await query(env,`SELECT json_group_array(json(row)) AS rows FROM (${sql})`,...args);return JSON.parse(row?.rows||'[]')}
const cookie=(req,value,age)=>`sos_member=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
async function member(req,env){const token=req.headers.get('Cookie')?.match(/(?:^|;\s*)sos_member=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return query(env,'SELECT m.id,m.name,m.email FROM members m JOIN member_sessions s ON s.member_id=m.id WHERE s.token_hash=? AND s.expires_at>? AND m.banned=0',await digest(token),Date.now())}
async function login(req,env,user){const token=random();await query(env,'INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES(?,?,?) RETURNING token_hash',await digest(token),user.id,Date.now()+604800000);return json({member:{id:user.id,name:user.name,email:user.email}},200,{'Set-Cookie':cookie(req,token,604800)})}
async function limit(env,key,max){const now=Date.now();const row=await query(env,'INSERT INTO member_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count',await digest(key),now+3600000,now,now);if(row.count>max)fail('Muitas tentativas. Aguarde uma hora antes de tentar novamente.',429)}
const orderSelect="SELECT json_object('id',o.id,'items',json(o.items),'total',o.total,'status',o.status,'demo',json(CASE WHEN o.is_demo=1 THEN 'true' ELSE 'false' END),'createdAt',o.created_at,'name',m.name,'email',m.email,'customer',json(o.customer)) AS row FROM member_orders o JOIN members m ON m.id=o.member_id";
export async function memberRoutes(req,env,{readStore,isAdmin}){
 const path=new URL(req.url).pathname;
 if(!path.startsWith('/api/members/')&&!path.startsWith('/api/admin/orders')&&!path.startsWith('/api/admin/users')&&!path.startsWith('/api/product-reviews'))return null;
 try{
  if(!['GET','POST'].includes(req.method))return json({error:'Método não permitido'},405);
  let body={};
  if(req.method==='POST'){
   if(req.headers.get('Origin')!==new URL(req.url).origin||req.headers.get('X-SOS-Member')!=='1')fail('Origem inválida.',403);
   if(!req.headers.get('Content-Type')?.startsWith('application/json'))fail('Formato inválido.',415);
   const raw=await req.text();if(raw.length>20000)fail('Dados muito grandes.',413);try{body=JSON.parse(raw)}catch{fail('Dados inválidos.')}
   if(!body||typeof body!=='object'||Array.isArray(body))fail('Dados inválidos.');
  }
  if(path.startsWith('/api/admin/users')){if(!isAdmin)fail('Acesso restrito à administração.',403);return await adminUsers(req,env,body,{query,list,fail,json})}
  if(path==='/api/product-reviews'&&req.method==='GET'){
   const id=new URL(req.url).searchParams.get('id');
   return json({reviews:await list(env,"SELECT json_object('name',m.name,'rating',r.rating,'text',r.text,'verified',json(CASE WHEN r.is_demo=0 THEN 'true' ELSE 'false' END),'demo',json(CASE WHEN r.is_demo=1 THEN 'true' ELSE 'false' END),'createdAt',r.created_at) AS row FROM member_reviews r JOIN members m ON m.id=r.member_id WHERE r.product_id=? ORDER BY r.created_at DESC LIMIT 200",id)});
  }
  if(path.startsWith('/api/admin/orders')){
   if(!isAdmin)fail('Acesso restrito à administração.',403);
   if(path==='/api/admin/orders'&&req.method==='GET')return json({orders:await list(env,orderSelect+' ORDER BY o.created_at DESC LIMIT 500')});
   if(path==='/api/admin/orders/status'&&req.method==='POST'){
    if(!['completed','cancelled'].includes(body.status)||typeof body.id!=='string')fail('Status inválido.');
    const updated=await query(env,"UPDATE member_orders SET status=?,updated_at=? WHERE id=? AND status='pending' RETURNING id",body.status,new Date().toISOString(),body.id);
    if(!updated)fail('Pedido não encontrado ou já finalizado.',409);return json({ok:true});
   }
   fail('Operação não encontrada.',404);
  }
  if(['/api/members/register','/api/members/login'].includes(path)&&req.method==='POST'){
   if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email.trim())||typeof body.password!=='string'||body.password.length<10||body.password.length>128)fail('Informe um e-mail válido e uma senha de 10 a 128 caracteres.');
   const email=body.email.trim().toLowerCase();const ip=req.headers.get('CF-Connecting-IP')||'local';
   await limit(env,'auth-email:'+email,20);await limit(env,'auth-ip:'+ip,100);
   if(path.endsWith('/register')){

    await limit(env,'register:'+ip,10);
    const profile=validateProfile(body);const salt=random();const hash=await passwordHash(body.password,salt);
    const user=await query(env,'INSERT INTO members(id,name,email,password_hash,salt,created_at,profile) VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING id,name,email',crypto.randomUUID(),profile.fullName,email,hash,salt,new Date().toISOString(),JSON.stringify(profile));
    if(!user)fail('Não foi possível cadastrar este e-mail. Se já tem uma conta, use Entrar.',409);return login(req,env,user);
   }
   const user=await query(env,'SELECT * FROM members WHERE email=?',email);
   const hash=await passwordHash(body.password,user?.salt||'invalid-user',!!user&&!user.password_hash.startsWith('pbkdf2-sha256:100000:'));
   if(!user||!equal(hash,user.password_hash))fail('E-mail ou senha incorretos.',401);
   if(user.banned)fail('Sua conta está suspensa. Entre em contato com a loja.',403);return login(req,env,user);
  }
  const user=await member(req,env);
  if(path==='/api/members/session'&&req.method==='GET')return json({member:user});
  if(!user)fail('Entre na sua conta para continuar.',401);
  if(path==='/api/members/profile'&&req.method==='GET'){const row=await query(env,'SELECT profile FROM members WHERE id=?',user.id);return json({profile:JSON.parse(row.profile)})}
  if(path==='/api/members/profile'&&req.method==='POST'){
   const row=await query(env,'SELECT profile,revision,name,email FROM members WHERE id=?',user.id);const stored=JSON.parse(row.profile);
   for(const key of ['fullName','cpf','gender','birthDate','email','name']){if(Object.hasOwn(body,key)){const expected=key==='email'?row.email:key==='name'?row.name:stored[key];const supplied=key==='cpf'&&typeof body[key]==='string'?body[key].replace(/\D/g,''):body[key];if(supplied!==expected)fail('Nome, e-mail, CPF, gênero e data de nascimento só podem ser alterados pela administração.',403)}}
   const next={...stored};for(const key of ['phone','cep','state','city','neighborhood','street','number','complement'])if(Object.hasOwn(body,key))next[key]=body[key];
   if(!stored.fullName||!stored.cpf||!stored.birthDate)fail('Peça à loja para completar seus dados pessoais antes de atualizar o cadastro.',400);
   const profile=validateProfile(next);const saved=await query(env,'UPDATE members SET profile=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id',JSON.stringify(profile),user.id,row.revision);if(!saved)fail('Seus dados foram atualizados em outra janela. Recarregue a página.',409);return json({profile})
  }
  if(path==='/api/members/logout'&&req.method==='POST'){
   const token=req.headers.get('Cookie')?.match(/(?:^|;\s*)sos_member=([a-f0-9]{64})(?:;|$)/)?.[1];
   await query(env,'DELETE FROM member_sessions WHERE token_hash=? RETURNING token_hash',await digest(token));return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});
  }
  if(path==='/api/members/orders'&&req.method==='GET')return json({orders:await list(env,orderSelect+' WHERE o.member_id=? ORDER BY o.created_at DESC',user.id),reviews:await list(env,"SELECT json_object('productId',product_id,'rating',rating,'text',text) AS row FROM member_reviews WHERE member_id=?",user.id)});
  if(path==='/api/members/orders'&&req.method==='POST'){
   if(typeof body.requestKey!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestKey)||!Array.isArray(body.items)||body.items.length<1||body.items.length>30)fail('Carrinho inválido.');
   const existing=await query(env,'SELECT id FROM member_orders WHERE member_id=? AND request_key=?',user.id,body.requestKey);if(existing)return json(existing);
   const memberData=await query(env,'SELECT profile FROM members WHERE id=?',user.id);const customer=validateProfile(JSON.parse(memberData.profile));const store=await readStore(env);const seen=new Set();
   const items=body.items.map(item=>{const p=store.products.find(p=>p.id===item.id&&p.active!==false&&p.mode==='cart'&&Number.isSafeInteger(p.price));if(!p||seen.has(item.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>10)fail('Um item está indisponível ou tem quantidade inválida. Atualize o carrinho.');seen.add(item.id);return{id:p.id,name:p.name,price:p.price,quantity:item.quantity}});
   await limit(env,'orders:'+user.id,20);
   const total=items.reduce((n,p)=>n+p.price*p.quantity,0),now=new Date().toISOString();
   const row=await query(env,"INSERT INTO member_orders(id,member_id,request_key,items,total,status,is_demo,created_at,updated_at,customer) VALUES(?,?,?,?,?,'pending',?,?,?,?) ON CONFLICT(member_id,request_key) DO UPDATE SET request_key=excluded.request_key RETURNING id",crypto.randomUUID(),user.id,body.requestKey,JSON.stringify(items),total,store.settings.demo?1:0,now,now,JSON.stringify(customer));
   return json(row,201);
  }
  if(path==='/api/members/reviews'&&req.method==='POST'){
   if(typeof body.productId!=='string'||!Number.isInteger(body.rating)||body.rating<1||body.rating>5||typeof body.text!=='string'||body.text.trim().length<3||body.text.length>600)fail('Escolha de 1 a 5 estrelas e escreva de 3 a 600 caracteres.');
   const purchase=await query(env,"SELECT o.id,o.is_demo FROM member_orders o,json_each(o.items) item WHERE o.member_id=? AND o.status='completed' AND json_extract(item.value,'$.id')=? ORDER BY o.is_demo ASC LIMIT 1",user.id,body.productId);
   if(!purchase)fail('Você poderá avaliar após a loja confirmar uma compra concluída deste produto.',403);
   const row=await query(env,'INSERT INTO member_reviews(id,member_id,product_id,rating,text,created_at,is_demo) VALUES(?,?,?,?,?,?,?) ON CONFLICT(member_id,product_id) DO NOTHING RETURNING id',crypto.randomUUID(),user.id,body.productId,body.rating,body.text.trim(),new Date().toISOString(),purchase.is_demo);
   if(!row)fail('Você já avaliou este produto.',409);return json({ok:true},201);
  }
  fail('Operação não encontrada.',404);
 }catch(e){if(e.status)return json({error:e.message},e.status);throw e}
}
