# ADR 0012 — Perfil da Pessoa

- Status: Proposed (implementado para o MVP; aguarda aprovação)
- Data: 2026-10-21

## Contexto

O ADR 0009 deixou para a tela de edição da Pessoa o restante do cadastro (foto, sexo, endereço,
redes sociais) e a regra de quem é dono de cada dado depois da conversão da conta. A direção do
projeto pediu o **Perfil**, no menu do usuário logado, com: foto; dados pessoais (nome completo,
sexo, data de nascimento, dois telefones, e-mail principal e e-mail secundário); endereço completo;
links das redes sociais; segurança (trocar senha e e-mail principal); e inscrições (receber
notícias). Também reafirmou que só uma Pessoa tem Perfil: a conta vira Pessoa ao virar membro e,
a partir daí, deixa de aparecer em Usuários e aparece somente em Membros.

## Decisão

- **Somente membros têm Perfil.** O item "Perfil" aparece no menu do usuário apenas quando a sessão
  é de membro (`isMember`), e as rotas do BFF respondem `403` para conta sem Pessoa.
- **A Pessoa da sessão, nunca um ID do navegador.** As rotas `/api/v1/profile` do BFF leem a Pessoa
  vinculada à conta (`auth.users.person_id`) e chamam `/api/v1/people/:id` na Core API.
- **Dono dos dados:**
  - Pessoa (Core API, `members.people`): nome, sexo (`MALE`/`FEMALE`, opcional), data de
    nascimento, telefone 1 e 2, e-mail principal, e-mail secundário (sem verificação), endereço,
    redes sociais e foto. O Perfil grava por substituição completa, com controle otimista
    (`version`).
  - Conta (BFF, `auth.users`): credenciais, e-mail de acesso e preferências de comunicação
    (`news_opt_in`). Nome e telefone ficam na conta como cópia da Pessoa, atualizada a cada
    gravação do Perfil, porque a sessão e o cabeçalho leem a conta.
- **E-mail principal = e-mail de acesso.** Não é editado pelo cadastro: a troca pede a senha atual,
  envia um link ao novo e-mail (`auth.email_change_tokens`, mesma validade e intervalo da
  verificação de e-mail) e só troca quando o link é aberto. A confirmação marca o novo e-mail como
  verificado, atualiza a Pessoa na mesma transação (se a Core API falhar, nada muda e o link continua
  válido) e avisa o e-mail anterior.
- **Troca de senha** pede a senha atual, aplica a política de senha do cadastro, mantém a sessão
  atual e encerra as demais.
- **Endereço** opcional; quando informado, logradouro, número, bairro, cidade, estado, CEP e país
  são obrigatórios (complemento e ponto de referência, não). País vazio é Brasil; no Brasil, CEP com
  8 dígitos e UF válida; em outro país, estado e código postal são texto livre.
- **Redes sociais**: Instagram, Facebook, LinkedIn, X/Twitter e YouTube, cada uma opcional, aceitas
  somente como link HTTPS do domínio da própria rede (sem protocolo, assume `https://`).
- **Foto**: mesmo fluxo da galeria (ADR 0010), no mesmo bucket e na área privada. O navegador pede
  uma URL de envio (`JPEG`, `PNG` ou `WebP`), envia direto ao bucket
  (`members/uploads/avatars/{pessoa}/{envio}`) e confirma; a Core API valida o conteúdo real, recorta
  em quadrado de 512 px, grava WebP sem metadados em
  `members/private/people/{pessoa}/avatar/{id}.webp` e apaga o envio e a foto anterior. Limite de
  10 MB; processada na própria requisição (uma imagem pequena). A leitura é por URL assinada de 1 h.
- **Inscrições**: `GET`/`PUT /api/v1/profile/subscriptions` (`{ news }`), na conta. Ainda não há
  envio de notícias; a preferência fica registrada com a data da última mudança.

## Consequências

- Migrations: `0005_perfil_pessoa` (Core API, colunas da Pessoa) e `0006_perfil_conta` (BFF,
  inscrição e links de troca de e-mail).
- Regra de ciclo de vida do R2: além de `gallery/uploads/`, apagar após 1 dia os objetos em
  `{pasta do ambiente}/members/uploads/` (envios de foto abandonados).
- A conta guarda nome e telefone duplicados da Pessoa; a fonte é a Pessoa e a cópia só muda pelo
  Perfil.
- O adaptador S3 da foto repete a técnica do adaptador da galeria, sem compartilhar código entre os
  contextos; extrair um cliente S3 compartilhado fica para depois.
- Sem o contexto Authorization, ninguém além da própria pessoa edita a Pessoa.

## Alternativas consideradas

- Perfil para qualquer conta verificada, criando a Pessoa no primeiro salvamento: descartada pela
  direção (só a Pessoa tem Perfil; ADR 0009).
- Ler nome e foto da Pessoa a cada `/auth/me`: descartada, pois o login passaria a depender da Core
  API, que leva até um minuto para acordar no Render Free.
- Trocar o e-mail sem confirmação no novo endereço: descartada, pois um erro de digitação tiraria o
  acesso à conta.
