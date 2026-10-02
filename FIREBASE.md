# Autenticação dos clientes

A produção usa Firebase Authentication (e-mail/senha) no projeto sosnotebookeinformatica. O Worker chama a API REST oficial para validar senhas e obter a identidade do usuário. As senhas não são calculadas nem armazenadas no Worker. Os tokens retornados pelo Firebase não são enviados ao navegador nem persistidos; após validar o acesso, a loja emite seu cookie HttpOnly/Secure/SameSite e mantém a sessão no D1.

Ative Authentication > E-mail/senha no Firebase antes de usar. A chave de API web configurada em wrangler.jsonc é pública; não é uma chave de conta de serviço. Não adicione credenciais administrativas ao repositório. Firebase Analytics, Storage, Firestore e serviços pagos não são usados por esta integração.

## Contas existentes

O cliente deve informar seu e-mail e clicar em Recuperar acesso. Para uma conta antiga ainda ausente no Firebase, o servidor provisiona uma senha aleatória não divulgada e solicita o e-mail de redefinição. O cliente define sua senha pelo link recebido e volta para entrar na loja.

Uma conta antiga só é vinculada quando o Firebase confirma a identidade e a propriedade do e-mail. A migração preserva o ID do cliente, perfil, pedidos e avaliações. O hash antigo é removido apenas após essa vinculação. Contas já vinculadas são identificadas pelo UID imutável do Firebase; outro UID não herda dados pelo simples uso do mesmo e-mail. Banimentos locais continuam impedindo login e uso de sessões.

A edição de e-mail pelo painel da loja é bloqueada durante esta integração para evitar divergência com o Firebase. Uma futura operação administrativa de troca de e-mail deve atualizar e verificar as duas bases. Os demais campos do perfil continuam editáveis conforme as permissões existentes.

## Operação

- A migração 0006_firebase_auth.sql adiciona o UID e seu índice exclusivo sem excluir dados.
- pnpm run deploy continua aplicando as migrações antes da publicação.
- O Worker precisa da variável FIREBASE_API_KEY. Sem ela, o fluxo antigo é mantido somente para compatibilidade com a prévia local.
- A recuperação envia e-mail somente quando o visitante clica em Recuperar acesso. Há limites por e-mail e IP, além das cotas do Firebase.
- A sessão da loja expira em sete dias. Banir no painel da loja revoga as sessões locais; alterações feitas apenas no Firebase não revogam automaticamente sessões já emitidas no D1.
- Se o Firebase responder CONFIGURATION_NOT_FOUND, inicialize Authentication no console. Se responder OPERATION_NOT_ALLOWED, habilite E-mail/senha.

Validação: node --test tests/*.test.mjs e node build.mjs. Os testes de integração usam respostas simuladas do Firebase e SQLite em memória; não usam dados reais de clientes.
