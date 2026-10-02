// Password validation runs on Firebase, never on the CPU-limited Worker.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export async function firebaseRequest(env,action,body){
 let response;
 try{response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+encodeURIComponent(env.FIREBASE_API_KEY),{
  method:'POST',headers:{'Content-Type':'application/json','X-Firebase-Locale':'pt'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
 })}catch{fail('O serviço de acesso está indisponível. Tente novamente em alguns instantes.',503)}
 let data;try{data=await response.json()}catch{fail('O serviço de acesso retornou uma resposta inválida.',503)}
 if(!response.ok){
  const code=String(data.error?.message||'').split(' : ')[0];
  const messages={
   EMAIL_EXISTS:['Este e-mail já tem acesso. Use Entrar ou Recuperar acesso.',409],
   INVALID_LOGIN_CREDENTIALS:['E-mail ou senha incorretos. Se sua conta é antiga, use Recuperar acesso.',401],
   EMAIL_NOT_FOUND:['E-mail ou senha incorretos. Se sua conta é antiga, use Recuperar acesso.',401],
   INVALID_PASSWORD:['E-mail ou senha incorretos. Use Recuperar acesso se necessário.',401],
   USER_DISABLED:['Sua conta está desativada. Entre em contato com a loja.',403],
   TOO_MANY_ATTEMPTS_TRY_LATER:['Muitas tentativas. Aguarde antes de tentar novamente.',429],
   OPERATION_NOT_ALLOWED:['O acesso por e-mail e senha precisa ser ativado pela loja.',503],
   CONFIGURATION_NOT_FOUND:['O cadastro e login estão em configuração. Tente novamente mais tarde.',503],
   WEAK_PASSWORD:['Use uma senha mais forte, com pelo menos 10 caracteres.',400],
   INVALID_EMAIL:['Informe um e-mail válido.',400]
  };
  const [message,status]=messages[code]||['Não foi possível acessar o serviço de autenticação.',503];
  throw Object.assign(new Error(message),{status,providerCode:code});
 }
 return data;
}
export async function firebaseMemberAuth(req,env,body,{query,limit,login,json,validateProfile}){
 const path=new URL(req.url).pathname;
 const reset=path==='/api/members/reset-password';
 if(!reset&&!['/api/members/register','/api/members/login'].includes(path))return null;
 if(req.method!=='POST')fail('Método não permitido.',405);
 if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email.trim()))fail('Informe um e-mail válido.');
 if(!reset&&(typeof body.password!=='string'||body.password.length<10||body.password.length>128))fail('Informe uma senha de 10 a 128 caracteres.');
 const email=body.email.trim().toLowerCase(),ip=req.headers.get('CF-Connecting-IP')||'local';
 await limit(env,'auth-email:'+email,20);await limit(env,'auth-ip:'+ip,100);
 const existing=await query(env,'SELECT * FROM members WHERE email=?',email);
 if(reset){
  await limit(env,'reset:'+email,3);await limit(env,'reset-ip:'+ip,10);
  // Provision legacy accounts with an unknowable password. Only the mailbox
  // owner can choose a password through Firebase's recovery email.
  if(existing&&!existing.firebase_uid&&!existing.banned){
   try{await firebaseRequest(env,'signUp',{email,password:crypto.randomUUID()+crypto.randomUUID(),returnSecureToken:true})}
   catch(e){if(e.providerCode!=='EMAIL_EXISTS')throw e}
  }
  try{await firebaseRequest(env,'sendOobCode',{requestType:'PASSWORD_RESET',email})}
  catch(e){if(e.providerCode!=='EMAIL_NOT_FOUND')throw e}
  return json({message:'Se houver uma conta para este e-mail, você receberá um link para definir uma nova senha. Confira também o spam.'});
 }
 const registering=path.endsWith('/register');
 let profile,auth;
 if(registering){
  await limit(env,'register:'+ip,10);
  if(existing)fail('Este e-mail já possui cadastro. Use Entrar ou Recuperar acesso para manter seus dados e pedidos.',409);
  profile=validateProfile(body);
  try{auth=await firebaseRequest(env,'signUp',{email,password:body.password,returnSecureToken:true})}
  catch(e){
   if(e.providerCode!=='EMAIL_EXISTS')throw e;
   // Retry safely if Firebase succeeded but saving the local profile failed.
   auth=await firebaseRequest(env,'signInWithPassword',{email,password:body.password,returnSecureToken:true});
  }
 }else{
  auth=await firebaseRequest(env,'signInWithPassword',{email,password:body.password,returnSecureToken:true});
 }
 if(typeof auth.localId!=='string'||!auth.idToken)fail('Não foi possível validar sua conta.',503);
 const info=await firebaseRequest(env,'lookup',{idToken:auth.idToken});
 const identity=info.users?.[0];
 if(!identity||identity.localId!==auth.localId||identity.email?.toLowerCase()!==email||identity.disabled)fail('Não foi possível validar sua conta.',401);
 let user=await query(env,'SELECT * FROM members WHERE firebase_uid=?',identity.localId);
 if(user&&user.email!==email)fail('O e-mail de acesso mudou. Entre em contato com a loja para atualizar seu cadastro.',409);
 if(!user&&existing){
  if(existing.firebase_uid)fail('Não foi possível vincular este acesso. Entre em contato com a loja.',409);
  if(existing.banned)fail('Sua conta está suspensa. Entre em contato com a loja.',403);
  if(!identity.emailVerified)fail('Para recuperar sua conta antiga, use Recuperar acesso e defina a senha pelo link enviado ao seu e-mail.',403);
  // Claim only a verified mailbox; preserve the member id and all purchases.
  user=await query(env,"UPDATE members SET firebase_uid=?,password_hash='firebase',salt='',revision=revision+1 WHERE id=? AND firebase_uid IS NULL AND email=? AND banned=0 RETURNING *",identity.localId,existing.id,email);
  if(!user)fail('Seu cadastro mudou. Tente entrar novamente.',409);
  await query(env,'DELETE FROM member_sessions WHERE member_id=? RETURNING member_id',user.id);
 }
 if(!user){
  if(!registering)fail('Seu acesso está válido. Use Criar cadastro para completar seus dados.',409);
  user=await query(env,"INSERT INTO members(id,name,email,password_hash,salt,created_at,profile,firebase_uid) VALUES(?,?,?,'firebase','',?,?,?) ON CONFLICT(email) DO NOTHING RETURNING *",crypto.randomUUID(),profile.fullName,email,new Date().toISOString(),JSON.stringify(profile),identity.localId);
  if(!user)fail('Este cadastro foi atualizado em outra janela. Use Entrar.',409);
 }
 if(user.banned)fail('Sua conta está suspensa. Entre em contato com a loja.',403);
 return login(req,env,user);
}
