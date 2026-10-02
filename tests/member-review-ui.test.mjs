import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Publishing a review refreshes orders and shows success instead of calling the orders array',async()=>{
 const source=fs.readFileSync(new URL('../dist/membros.js',import.meta.url),'utf8');
 const start=source.indexOf('async function loadOrders()');
 const end=source.indexOf('\nPromise.all(',start);
 assert.ok(start>=0&&end>start);
 const root={innerHTML:''},button={disabled:false},messages=[];
 const form={dataset:{review:'ssd'},elements:{rating:{value:'4'},text:{value:'Avaliação de teste.'}},querySelector:()=>button};
 let published=false,reads=0;
 const context=vm.createContext({
  $:()=>root,esc:String,money:String,store:{settings:{phone:'5599999999999'}},
  document:{querySelectorAll:()=>root.innerHTML.includes('data-review=')?[form]:[]},
  message:(text,error=false)=>messages.push({text,error}),
  api:async(path,body)=>{
   if(path==='/api/members/reviews'){assert.equal(body.productId,'ssd');published=true;return{ok:true}}
   assert.equal(path,'/api/members/orders');reads++;
   return{orders:[{id:'test-order',status:'completed',demo:true,createdAt:'2026-10-01',items:[{id:'ssd',name:'SSD',quantity:1,price:100}],total:100}],reviews:published?[{productId:'ssd'}]:[]};
  }
 });
 vm.runInContext(source.slice(start,end),context);
 await context.loadOrders();
 assert.match(root.innerHTML,/data-review=/);
 await form.onsubmit({preventDefault(){}});
 assert.equal(published,true);assert.equal(reads,2);
 assert.match(root.innerHTML,/Você já avaliou SSD/);
 assert.doesNotMatch(root.innerHTML,/data-review=/);
 assert.deepEqual(messages,[{text:'Avaliação publicada na página do produto. Obrigado!',error:false}]);
});
