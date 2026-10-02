const invalid=message=>{throw Object.assign(new Error(message),{status:400})};
const digits=value=>typeof value==='string'?value.replace(/\D/g,''):'';
function text(value,label,max=120,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))invalid('Informe '+label+' corretamente.');return value.trim()}
export function validCPF(value){const cpf=digits(value);if(!/^\d{11}$/.test(cpf)||/^(\d)\1+$/.test(cpf))return false;for(let n=9;n<11;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);const digit=(sum*10)%11%10;if(digit!==Number(cpf[n]))return false}return true}
export function validateProfile(input){
 if(!input||typeof input!=='object')invalid('Complete seus dados de cadastro.');
 if(typeof input.fullName!=='string'||input.fullName.trim().length<2)invalid('Informe seu nome completo.');
 const cpf=digits(input.cpf);if(!validCPF(cpf))invalid('Informe um CPF válido.');
 const birthDate=text(input.birthDate,'a data de nascimento',10),date=new Date(birthDate+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==birthDate||birthDate<'1900-01-01'||birthDate>new Date().toISOString().slice(0,10))invalid('Informe uma data de nascimento válida, que não seja futura.');
 const gender=input.gender||'not-informed';if(!['female','male','non-binary','other','not-informed'].includes(gender))invalid('Selecione uma opção de gênero.');
 const phone=digits(input.phone);if(!/^[1-9]{2}\d{8,9}$/.test(phone))invalid('Informe o telefone com DDD (10 ou 11 dígitos).');
 const cep=digits(input.cep);if(!/^\d{8}$/.test(cep))invalid('Informe um CEP com 8 dígitos.');
 const state=text(input.state,'o estado',2).toUpperCase();if(!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(state))invalid('Selecione um estado válido.');
 return {fullName:text(input.fullName,'o nome completo',150),cpf,birthDate,gender,phone,cep,state,city:text(input.city,'a cidade'),neighborhood:text(input.neighborhood,'o bairro'),street:text(input.street,'a rua',200),number:text(input.number,'o número ou S/N',20),complement:text(input.complement||'','o complemento',120,false)};
}
