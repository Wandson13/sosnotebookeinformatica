import {validateProfile} from './member-profile.mjs';
export async function adminUsers(req,env,body,{query,list,fail,json}){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/api/admin/users'&&req.method==='GET'){
  const search=(url.searchParams.get('search')||'').slice(0,150).trim();const page=Math.max(0,Math.min(100000,parseInt(url.searchParams.get('page')||'0',10)||0));
  const where=" WHERE instr(lower(name),lower(?))>0 OR instr(lower(email),lower(?))>0";
  const count=await query(env,'SELECT count(*) AS total FROM members'+where,search,search);
  const users=await list(env,"SELECT json_object('id',id,'name',name,'email',email,'banned',banned,'createdAt',created_at) AS row FROM members"+where+' ORDER BY created_at DESC,id LIMIT 30 OFFSET ?',search,search,page*30);
  return json({users,total:count.total,page});
 }
 const id=req.method==='GET'?url.searchParams.get('id'):body.id;
 if(typeof id!=='string'||id.length>80)fail('Usuário inválido.');
 const user=await query(env,'SELECT id,name,email,profile,banned,ban_reason,revision,created_at FROM members WHERE id=?',id);if(!user)fail('Usuário não encontrado.',404);
 if(path==='/api/admin/users/detail'&&req.method==='GET'){
  const reviews=await list(env,"SELECT json_object('id',id,'productId',product_id,'rating',rating,'text',text,'demo',is_demo,'createdAt',created_at) AS row FROM member_reviews WHERE member_id=? ORDER BY created_at DESC",id);
  const orders=await list(env,"SELECT json_object('id',id,'items',json(items),'total',total,'status',status,'demo',is_demo,'createdAt',created_at) AS row FROM member_orders WHERE member_id=? ORDER BY created_at DESC",id);
  return json({user:{id:user.id,name:user.name,email:user.email,profile:JSON.parse(user.profile),banned:!!user.banned,banReason:user.ban_reason,revision:user.revision,createdAt:user.created_at},reviews,orders});
 }
 if(!Number.isInteger(body.revision)||body.revision!==user.revision)fail('Este cadastro mudou. Feche e abra novamente antes de salvar.',409);
 if(path==='/api/admin/users/update'&&req.method==='POST'){
  const profile=validateProfile(body.profile);
  if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email.trim()))fail('Informe um e-mail válido.');const email=body.email.trim().toLowerCase();
  if(env.FIREBASE_API_KEY&&email!==user.email)fail('A alteração de e-mail precisa ser sincronizada com o Firebase. Mantenha o e-mail atual e entre em contato com o responsável técnico.',409);
  const saved=await query(env,'UPDATE members SET name=?,email=?,profile=?,revision=revision+1 WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM members WHERE email=? AND id<>?) RETURNING id',profile.fullName,email,JSON.stringify(profile),id,body.revision,email,id);
  if(!saved)fail('O e-mail já está em uso ou o cadastro mudou. Reabra o usuário e confira os dados.',409);
  if(email!==user.email)await query(env,'DELETE FROM member_sessions WHERE member_id=? RETURNING member_id',id);
  return json({ok:true});
 }
 if(path==='/api/admin/users/ban'&&req.method==='POST'){
  if(typeof body.banned!=='boolean'||typeof body.reason!=='string'||body.reason.length>300)fail('Informe um status e um motivo de até 300 caracteres.');
  const saved=await query(env,'UPDATE members SET banned=?,ban_reason=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id',body.banned?1:0,body.banned?body.reason.trim():'',id,body.revision);
  if(!saved)fail('O cadastro mudou. Reabra o usuário.',409);
  await query(env,'DELETE FROM member_sessions WHERE member_id=? RETURNING member_id',id);
  return json({ok:true});
 }
 fail('Operação não encontrada.',404);
}
