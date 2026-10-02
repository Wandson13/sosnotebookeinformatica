# SOS Notebook e Informática

Loja e painel administrativo com produtos, categorias, serviços e configurações da marca.

## Usar a prévia local

Com Node.js 24 instalado, abra esta pasta no terminal e execute:

```
node dev-server.mjs
```

Loja: http://127.0.0.1:4175/

Painel: http://127.0.0.1:4175/admin.html

Clique em **Entrar na prévia local**. Esse acesso funciona somente no servidor local ligado ao endereço 127.0.0.1. Não exponha esse servidor na internet. A sessão local expira em oito horas ou quando o servidor é encerrado.

Os cadastros ficam no banco SQLite em `.local/store.sqlite`; as imagens enviadas ficam em `.local/uploads`. Para fazer uma cópia de segurança, encerre o servidor e copie a pasta `.local` inteira. Ela não está incluída neste pacote inicial. Não apague essa pasta se quiser preservar alterações feitas no painel.

## O que o painel permite

- Cadastrar, editar, ocultar e excluir produtos, com foto, preço, descrição, categoria e canal de venda.
- Criar, renomear e excluir categorias sem produtos vinculados.
- Cadastrar e editar os serviços exibidos na página inicial.
- Alterar nome, WhatsApp, endereço, horários, logo, favicon, cor principal e conteúdo de destaque.
- Ativar ou desativar a indicação de catálogo demonstrativo.

As alterações salvas aparecem na loja ao abrir ou atualizar a página. Produtos ocultos não aparecem no catálogo público. O carrinho não processa pagamentos: a contratação e integração de um provedor continuam pendentes.

## Publicação na Cloudflare

Loja: https://sosnotebookeinformatica.wandson.workers.dev/

Login administrativo: https://sosnotebookeinformatica.wandson.workers.dev/admin/login

O GitHub armazena o código, HTML, CSS, JavaScript e imagens estáticas. O Cloudflare Workers publica a aplicação; o banco D1 `sos-notebook-db` armazena os dados online e o bucket R2 privado `sos-notebook-imagens` recebe as imagens enviadas pelo painel. O banco real e dados pessoais não são enviados ao Git.

A branch `main` está conectada ao Workers Builds. Build: `pnpm run build`; deploy: `pnpm run deploy` (aplica as migrações e publica). `wrangler.jsonc` define bindings e as configurações não secretas da autenticação.

O login usa Cloudflare Access no caminho `/admin/login`, com política restrita ao e-mail administrador confirmado pelo proprietário. O Worker valida assinatura, emissor, público-alvo, expiração e e-mail do token em cada requisição administrativa. As variáveis `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` e `ADMIN_EMAIL` devem corresponder ao aplicativo Access. A loja e a área de clientes continuam públicas.

O banco local e o banco online são separados, sem sincronização automática. Os cadastros e uploads existentes em `.local` ainda não foram importados. Sem catálogo salvo no D1, a loja usa o catálogo inicial de `seed.mjs`. Não exponha o servidor de prévia local na internet.

## Manutenção técnica

As migrações em `drizzle/` são aplicadas automaticamente na inicialização local. O servidor de produção usa D1 e R2. `node build.mjs` prepara o Worker em `dist/server` e os arquivos públicos em `dist/client`. Para testes: `node --test tests/*.test.mjs`. Para gerar novas migrações, instale as dependências com pnpm e use `pnpm db:generate`.

## Área de membros e pedidos

Acesse membros.html pelo botão Minha conta. O cliente cria cadastro com nome, e-mail e senha e pode registrar pedidos pelo carrinho ou pela página do produto. Não há cobrança automática: pagamento, entrega e frete são combinados com a loja.

Em Pedidos de clientes, o administrador confirma a compra concluída apenas após verificar pagamento e entrega. Isso libera uma avaliação por cliente e produto, de 1 a 5 estrelas, exibida publicamente com o nome completo e o selo Compra verificada. Avaliações manuais antigas do catálogo não são usadas como avaliações de compradores.

O modo demonstrativo atual identifica os pedidos como testes e libera avaliações identificadas como demonstração após a conclusão. Desative Catálogo demonstrativo em Loja e aparência para receber pedidos reais; pedidos antigos de demonstração continuam sendo testes.

Cadastros, sessões, pedidos e avaliações ficam em tabelas separadas do catálogo, preservados ao editar produtos. A migração 0001_members.sql é aplicada ao iniciar a prévia; aplique-a também no banco online antes de publicar. Os hashes de senha usam PBKDF2 e as sessões usam cookies HttpOnly. Ainda não há recuperação de senha por e-mail nem confirmação de endereço de e-mail, pois não há serviço de e-mail integrado. Pagamento online também depende de integração futura. A publicação online mantém o modo demonstrativo até a configuração definitiva da loja.

## Dados do cliente e consulta de CEP

O cadastro inclui nome completo, CPF com validação dos dígitos verificadores, nascimento, gênero (com opção de não informar), telefone com DDD, CEP, rua, número, complemento, bairro, cidade e UF. Contas existentes completam ou alteram esses campos em Meus dados e endereço. A migração 0002_member_profile.sql preserva as contas anteriores.

A consulta usa https://viacep.com.br e envia apenas o CEP, sem cookies ou referência da página. Os campos continuam editáveis e podem ser preenchidos manualmente se o serviço estiver indisponível. O nome completo do cadastro é usado nas avaliações públicas. Dados privados não são incluídos nas avaliações públicas. Cada pedido guarda o endereço informado naquele momento; alterações posteriores de cadastro não mudam pedidos anteriores.

## Gerenciar usuários

No painel, abra Usuários para buscar por nome ou e-mail. Dados e avaliações mostra o cadastro completo e as avaliações do cliente, com links para os produtos. Você pode editar os dados, banir e reativar a conta. Banir bloqueia o acesso e revoga sessões, preservando pedidos e avaliações. Alterar o e-mail também encerra as sessões. Senhas não são expostas nem editadas nessa tela. Alterações simultâneas são detectadas para evitar sobrescrever um cadastro atualizado em outra janela.

Na ficha do usuário, Dados, compras e avaliações inclui o histórico de pedidos, itens, quantidades, totais, datas, status e indicação de demonstração. Clientes só podem alterar telefone e endereço. Nome, e-mail, CPF, gênero e nascimento são protegidos também pela API e só podem ser alterados pela administração. Para cadastros antigos incompletos, a loja deve completar os dados pessoais.

