import fs from 'node:fs';
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/client',{recursive:true});
for(const item of fs.readdirSync('dist',{withFileTypes:true}))if(item.isFile())fs.copyFileSync('dist/'+item.name,'dist/client/'+item.name);
fs.copyFileSync('server.mjs','dist/server/index.js');fs.copyFileSync('seed.mjs','dist/server/seed.mjs');
console.log('Worker e arquivos públicos preparados.');

fs.copyFileSync('members.mjs','dist/server/members.mjs');

fs.copyFileSync('member-profile.mjs','dist/server/member-profile.mjs');

fs.copyFileSync('admin-users.mjs','dist/server/admin-users.mjs');
fs.copyFileSync('firebase-members.mjs','dist/server/firebase-members.mjs');
