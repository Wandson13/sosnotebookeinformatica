import {memberRoutes} from './members.mjs';
import seed from './seed.mjs';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function assert(value,message){if(!value)throw new Error(message)}
function string(value,max,required=true){assert(typeof value==='string'&&value.length<=max&&(!required||value.trim().length),'Texto inválido ou muito longo');return value.trim()}
function asset(value){string(value,2048,false);if(!value)return '';assert(/^\/(?:media\/[a-f0-9-]+\.(?:png|jpg|webp)|(?:sos-logo|favicon|hero-repair)\.png)$/.test(value)||/^https:\/\//.test(value),'Use uma imagem enviada ou um endereço HTTPS');return value}
export function validate(input){
 assert(input&&typeof input==='object','Dados inválidos');const {settings,products,categories,services}=input;
 assert(Array.isArray(categories)&&categories.length>0&&categories.length<=50,'Cadastre de 1 a 50 categorias');const cats=categories.map(c=>string(c,70));assert(new Set(cats).size===cats.length,'Categorias duplicadas');
 assert(settings&&/^\d{10,15}$/.test(settings.phone),'WhatsApp inválido: inclua país e DDD');assert(/^#[a-f0-9]{6}$/i.test(settings.color),'Cor inválida');
 const cleanSettings={name:string(settings.name,100),phone:settings.phone,color:settings.color,logo:asset(settings.logo),favicon:asset(settings.favicon),heroImage:asset(settings.heroImage),headline:string(settings.headline,120),highlight:string(settings.highlight,120),description:string(settings.description,500),address:string(settings.address,300,false),hours:string(settings.hours,200,false),demo:settings.demo===true};
 assert(Array.isArray(products)&&products.length<=500,'Limite de 500 produtos');const ids=new Set();const cleanProducts=products.map(p=>{
  const id=string(p.id,80);assert(/^[a-zA-Z0-9_-]+$/.test(id)&&!ids.has(id),'Identificador de produto inválido');ids.add(id);assert(cats.includes(p.category),'Categoria de produto inexistente');assert(['cart','whatsapp'].includes(p.mode),'Canal inválido');assert(p.price===null||(Number.isSafeInteger(p.price)&&p.price>=0&&p.price<=100000000),'Preço inválido');assert(p.mode!=='cart'||p.price!==null,'Informe o preço para o carrinho');
  const photos=p.images===undefined?(p.image?[p.image]:[]):p.images;assert(Array.isArray(photos)&&photos.length<=10,'Use até 10 fotos por produto');const images=photos.map(url=>{assert(typeof url==='string'&&url.length>0,'Imagem inválida');return asset(url)});
  const detailImages=Array.isArray(p.detailImages)?p.detailImages.slice(0,12).map(url=>asset(url)):[];
  const descriptionBlocks=Array.isArray(p.descriptionBlocks)?p.descriptionBlocks.slice(0,20).map(block=>({text:string(block?.text||'',2000,false),image:asset(block?.image||''),layout:['text-image','image-text','text','image'].includes(block?.layout)?block.layout:'text-image'})).filter(block=>block.text||block.image):undefined;
  const specs=Array.isArray(p.specs)?p.specs.slice(0,40).map(s=>({label:string(s.label,80),value:string(s.value,500)})):[];
  const reviews=Array.isArray(p.reviews)?p.reviews.slice(0,30).map(r=>({name:string(r.name,100),text:string(r.text,600),rating:Number.isInteger(r.rating)&&r.rating>=1&&r.rating<=5?r.rating:5,image:asset(r.image||''),verified:r.verified===true})):[];
  return {id,name:string(p.name,150),description:string(p.description,1000,false),longDescription:string(p.longDescription||'',5000,false),descriptionBlocks,category:p.category,price:p.price,mode:p.mode,image:images[0]||'',images,detailImages,specs,reviews,paymentInfo:string(p.paymentInfo||'',600,false),brand:string(p.brand||'',100,false),model:string(p.model||'',100,false),sku:string(p.sku||'',80,false),icon:['laptop','monitor','printer','drive','mouse','cpu'].includes(p.icon)?p.icon:'cpu',active:p.active!==false};
 });
 assert(Array.isArray(services)&&services.length<=50,'Limite de 50 serviços');const cleanServices=services.map(s=>({name:string(s.name,150),description:string(s.description,1000,false),icon:['laptop','monitor','printer','cpu','refresh','shield','wrench'].includes(s.icon)?s.icon:'wrench'}));
 const suppliedBanners=input.banners??[{eyebrow:'TECNOLOGIA QUE VOLTA A FUNCIONAR',title:cleanSettings.headline,highlight:cleanSettings.highlight,description:cleanSettings.description,image:cleanSettings.heroImage,buttonText:'Preciso de assistência',destination:'services'}];
 assert(Array.isArray(suppliedBanners)&&suppliedBanners.length>=1&&suppliedBanners.length<=8,'Mantenha de 1 a 8 banners');
 const banners=suppliedBanners.map(b=>{assert(['products','services','whatsapp'].includes(b.destination),'Destino do banner inválido');assert(b.image,'Adicione uma foto ao banner');return{eyebrow:string(b.eyebrow,90,false),title:string(b.title,120),highlight:string(b.highlight,120,false),description:string(b.description,500,false),image:asset(b.image),buttonText:string(b.buttonText,50,false),destination:b.destination}});
 return{settings:cleanSettings,products:cleanProducts,categories:cats,services:cleanServices,banners};
}
function authorized(request,env){return !!env.ADMIN_EMAIL&&!!request.headers.get('oai-authenticated-user-id')&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.ADMIN_EMAIL.toLowerCase()}
async function readStore(env){const row=await env.DB.prepare('SELECT body, revision, updated_at FROM site_content WHERE id = ?').bind('store').first();return row?{...JSON.parse(row.body),revision:row.revision,updatedAt:row.updated_at}:{...structuredClone(seed),revision:0,updatedAt:null}}
export default {async fetch(request,env){
 const url=new URL(request.url);const path=url.pathname;
 try{
  const memberResponse=await memberRoutes(request,env,{readStore,isAdmin:authorized(request,env)});if(memberResponse)return memberResponse;
  if(path.startsWith('/media/')){if(!/^\/media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(path))return response({error:'Arquivo não encontrado'},404);const obj=await env.BUCKET.get(path.slice(7));return obj?new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=86400'}}):response({error:'Arquivo não encontrado'},404)}
  if(path==='/api/session')return response({authenticated:authorized(request,env),local:env.LOCAL_PREVIEW===true});
  if(path==='/api/catalog'&&request.method==='GET'){const state=await readStore(env);return response({...state,products:state.products.filter(p=>p.active!==false),onlinePaymentAvailable:false})}
  if(path.startsWith('/api/admin/')){
   if(!authorized(request,env))return response({error:'Entre com a conta administradora para continuar.'},403);
   if(request.method!=='GET'&&(request.headers.get('Origin')!==url.origin||request.headers.get('X-SOS-Admin')!=='1'))return response({error:'Origem da solicitação inválida.'},403);
   if(path==='/api/admin/store'&&request.method==='GET')return response(await readStore(env));
   if(path==='/api/admin/store'&&request.method==='PUT'){
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return response({error:'Formato inválido'},415);
    const text=await request.text();if(text.length>1500000)return response({error:'Catálogo muito grande'},413);
    let input,clean;try{input=JSON.parse(text);assert(Number.isSafeInteger(input.revision)&&input.revision>=0,'Revisão inválida');clean=validate(input)}catch(e){return response({error:e.message},400)}
    const current=await readStore(env);if(current.revision!==input.revision)return response({error:'O catálogo mudou em outra janela. Recarregue o painel antes de salvar.'},409);
    const now=new Date().toISOString();const row=await env.DB.prepare('INSERT INTO site_content (id, body, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, revision = site_content.revision + 1, updated_at = excluded.updated_at WHERE site_content.revision = ? RETURNING revision').bind('store',JSON.stringify(clean),now,input.revision).first();
    if(!row)return response({error:'Outra alteração foi salva. Recarregue e tente novamente.'},409);return response({...clean,revision:row.revision,updatedAt:now});
   }
   if(path==='/api/admin/upload'&&request.method==='POST'){
    if(Number(request.headers.get('Content-Length')||0)>4000000)return response({error:'Limite de 3 MB por imagem.'},413);
    const form=await request.formData();const file=form.get('image');if(!file||typeof file.arrayBuffer!=='function'||file.size>3145728)return response({error:'Selecione uma imagem de até 3 MB.'},400);
    const bytes=new Uint8Array(await file.arrayBuffer());let ext,mime;
    if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71){ext='png';mime='image/png'}
    else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){ext='jpg';mime='image/jpeg'}
    else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'){ext='webp';mime='image/webp'}
    else return response({error:'Use uma imagem PNG, JPEG ou WebP válida.'},400);
    const key=crypto.randomUUID()+'.'+ext;await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});return response({url:'/media/'+key});
   }
   return response({error:'Operação não encontrada'},404);
  }
  if(path.startsWith('/api/'))return response({error:'Operação não encontrada'},404);
  return env.ASSETS.fetch(request);
 }catch(e){console.error('Falha no atendimento da loja:',e.message);return response({error:'Não foi possível acessar os dados agora. Tente novamente; suas alterações não foram descartadas.'},503)}
}};
