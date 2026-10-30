# ADR 0013 — Formulários dos departamentos e grupos de e-mails

- Status: Proposed (primeira etapa implementada; aguarda aprovação)
- Data: 2026-10-28

## Contexto

A direção do projeto pediu formulários para os departamentos, começando pela Liderança: pesquisas e
avaliações de desempenho com nome, descrição, período de validade, perguntas (texto curto, texto
longo, múltipla escolha e escolha única), imagem de cabeçalho e status (não publicado, publicado,
finalizado, cancelado). Os formulários são enviados por e-mail a **grupos de e-mails**, que também
precisam de cadastro: um grupo reúne contas verificadas da aplicação, sejam membros ou não.

O frontend foi estruturado primeiro com mocks (MSW) para validar o fluxo; este ADR registra o
contrato que substituiu os mocks. O envio dos e-mails, a resposta digital por link com token, a
versão para impressão e o registro de respostas em papel ficam para a próxima etapa (ver
Consequências).

## Decisão

### Contextos

- **Communication** (`modules/communication`, schema `communication`): Aggregate `EmailGroup`
  (nome único sem diferenciar maiúsculas, até 80 caracteres; descrição até 300; até 5.000 contas).
  O grupo guarda somente os IDs das contas do BFF (`auth.users`), sem copiar e-mails: o endereço
  vigente é resolvido no envio. Contrato público para outros contextos: `EmailGroupDirectory`
  (`existingIds`).
- **Forms** (`modules/forms`, schema `forms`): Aggregate `Form`. Perguntas e opções são Value Objects
  do Aggregate, gravadas juntas em `jsonb` na ordem de exibição, com IDs estáveis entre edições
  (UUIDv7 gerados pela Core API; um ID desconhecido gera um novo). Os grupos destinatários são
  referenciados por ID e conferidos em Communication pelo contrato público, por uma Anticorruption
  Layer.
- **Departamentos**: catálogo governado por código (`leadership` por enquanto). Departamento fora do
  catálogo responde 404.

### Regras do formulário

- Título até 120, descrição até 2.000, de 1 a 50 perguntas (título até 200, descrição até 500).
  Checkbox e radio têm de 1 a 20 opções distintas, até 100 caracteres cada; texto não tem opções.
  Datas civis com fim igual ou posterior ao início. Até 50 grupos destinatários.
- Status: `DRAFT` → `PUBLISHED`/`CANCELLED`; `PUBLISHED` → `DRAFT`/`FINISHED`/`CANCELLED`;
  `FINISHED` e `CANCELLED` são finais (somente leitura). Um novo nasce `DRAFT` ou `PUBLISHED`.
- Publicar exige ao menos um grupo e data de fim que não passou (fuso da comunidade).
- Excluir é permitido em qualquer status, exceto `PUBLISHED`, e apaga a imagem do cabeçalho.
- Grupo excluído continua citado pelos formulários que o usavam; ao salvar de novo, o ID inexistente
  é recusado (400 em `recipientGroupIds`).
- Controle otimista por `version` em todas as gravações.

### Imagem do cabeçalho

Mesmo fluxo da foto do Perfil (ADR 0012), no mesmo bucket e na área privada: o navegador pede uma
URL (`POST /forms/:id/header-image/uploads`, PNG, JPEG ou WebP), envia direto a
`forms/uploads/header-images/{formulário}/{envio}` e confirma (`PUT /forms/:id/header-image`). A Core
API recusa acima de 2 MB, valida o conteúdo real, aplica a rotação do EXIF, reduz para caber em
1600 x 1200 px (o dobro da exibição máxima de 800 x 600, sem ampliar), grava WebP sem metadados em
`forms/private/forms/{formulário}/header-image/{id}.webp` e apaga o envio e a imagem anterior.
Processada na própria requisição. Leitura por URL assinada de 1 h. Formulário finalizado ou cancelado
não troca a imagem.

### Rotas

| BFF (`/api/v1`)                                            | Core API                                                     | Uso                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `GET/POST departments/:department/forms`                   | idem                                                         | lista (status, cursor) e cria                   |
| `GET departments/:department/forms/summary`                | idem                                                         | total e quantidade por status                   |
| `GET/PATCH/DELETE forms/:id`                               | idem                                                         | lê, edita (completo, com `version`), exclui     |
| `PUT forms/:id/status`                                     | idem                                                         | muda só o status (`{ version, status }`)        |
| `POST forms/:id/header-image/uploads`                      | idem                                                         | URL de envio da imagem                          |
| `PUT/DELETE forms/:id/header-image`                        | idem                                                         | confirma o envio ou remove a imagem             |
| `GET/POST email-groups`, `GET/PUT/DELETE email-groups/:id` | idem                                                         | grupos (PUT = substituição completa)            |
| `GET email-recipients`                                     | — (BFF, `auth.users`)                                        | contas ativas com e-mail verificado             |
| `POST forms/:id/email-dispatches` (202)                    | idem + `.../:dispatchId/invitations` e `PUT .../:dispatchId` | envia os e-mails aos grupos (em segundo plano)  |
| `POST public/form-invitations/lookup` e `/answers`         | idem                                                         | resposta pelo link (sem sessão; token no corpo) |

Regra provisória do MVP, como nas demais rotas: sessão com e-mail verificado e `X-CSRF-Token` nas
alterações; papéis e permissões ainda não existem. Recusas de regra respondem 409 com a explicação
(Problem Details), exibida pelo frontend.

### Envio dos e-mails e resposta pelo link

- Publicar não envia e-mails. O envio é a ação "Enviar e-mails do grupo" (depois, "Reenviar"), só
  para formulário publicado, com grupos e com a data de fim não passada.
- O BFF pede à Core API para iniciar o envio: o formulário fica com `emailDispatch.status = SENDING`
  e **não aceita nenhuma alteração** (edição, status, imagem, exclusão, novo envio) até a conclusão.
  O BFF responde 202 e continua em segundo plano: resolve nome e e-mail atuais das contas dos grupos
  (ativas e verificadas), pede os convites à Core API (que devolve os tokens uma única vez), envia
  um e-mail por vez pelo Resend (com intervalo e até 3 tentativas) e informa o resultado
  (`SENT`/`FAILED`, enviados e falhas). O painel acompanha relendo a lista a cada 3 s.
- Envio parado em `SENDING` por mais de 15 minutos (ex.: BFF reiniciado no meio) deixa de bloquear e
  aparece como `FAILED`.
- Convite (`forms.form_invitations`): um por conta e formulário, com nome e e-mail do momento do
  envio, **hash SHA-256** do token (32 bytes aleatórios, base64url) e a resposta. Reenviar troca o
  token dos pendentes (o link anterior deixa de valer), cria convites para quem entrou nos grupos e
  não envia a quem já respondeu.
- Página pública `/formularios/responder?token=...` no frontend: o token sai da barra de endereço ao
  abrir. Nome e e-mail vêm do convite e não são editáveis. Aceita uma única resposta, somente com o
  formulário publicado e dentro do período; nenhuma pergunta é obrigatória, mas ao menos uma precisa
  de resposta (texto curto até 500 caracteres, longo até 5.000; radio com uma opção).
- O e-mail leva em anexo a **versão para impressão** (PDF A4 gerado no BFF com `pdfkit`), com nome e
  e-mail de quem responde já preenchidos e o espaço de cada resposta. Se o PDF falhar, o e-mail
  segue só com o link.

### Respostas no painel

- Rotas do BFF em `/api/v1/forms/:id/invitations` (encaminhadas à Core API): `GET` lista os convites
  com as respostas; `PUT/DELETE .../:invitationId/paper-answer` marca ou desfaz a resposta em papel;
  `POST .../paper-attachment/uploads` e `PUT .../paper-attachment` enviam o anexo (direto ao bucket,
  como a imagem do cabeçalho); `GET .../paper-attachment` devolve a URL de leitura (5 min; abre no
  visualizador do navegador, com o nome do arquivo para baixar).
- Resposta em papel (`answer_channel = PAPER`): só para convite sem resposta digital; o anexo é
  opcional (PDF, JPEG ou PNG até 2 MB, tipo conferido pelos primeiros bytes) e fica em
  `forms/private/forms/{formulário}/paper-answers/{convite}/{id}.{ext}`. Trocar o anexo apaga o
  anterior; desfazer volta o convite a pendente e apaga o anexo; excluir o formulário apaga os anexos.
- Respostas digitais: vistas num diálogo e em PDF (`GET /api/v1/forms/:id/invitations/:invitationId/answers.pdf`, gerado no BFF com o mesmo `pdfkit` da versão para impressão, agora com as respostas preenchidas e opções marcadas). O painel abre o PDF numa nova aba, no visualizador do navegador (ler, baixar, imprimir).

### Perguntas, configurações e modelos

- Tipos: texto curto, texto longo, múltipla escolha, escolha única, lista suspensa (`SELECT`), escala
  (`SCALE`, de 0 ou 1 até 2..10, com rótulos opcionais nas pontas ou um nome por ponto em
  `pointLabels`, ex.: Péssimo, Ruim, Regular, Bom, Ótimo), data (`DATE`) e número
  (`NUMBER`). Cada pergunta pode ser obrigatória; sem nenhuma obrigatória, ao menos uma resposta é
  exigida. Respostas guardam texto, opções ou valor (`value`, para escala e número).
- Configurações do formulário: **anônimo** (as respostas vão para `forms.form_anonymous_responses`,
  sem vínculo com o convite e só com a data; o painel mostra quem respondeu, nunca o quê; não pode ser
  ligado nem desligado depois da primeira resposta), **permitir alterar a resposta** até o fim do
  período (incompatível com anônimo) e **texto de consentimento (LGPD)**, cujo aceite é obrigatório.
- Duplicar formulário (`POST /forms/:id/duplicates`): cópia não publicada com perguntas (IDs novos),
  configurações, grupos ainda existentes e imagem do cabeçalho (objeto próprio no bucket). É também
  o "modelo": a tela de novo formulário oferece começar de um existente.

### Relatório

- `GET /forms/:id/report`: participação (convidados, respostas pelo link, em papel, pendentes) e,
  por pergunta, contagem por opção, distribuição da escala, média/mínimo/máximo e respostas de texto
  em ordem alfabética (nunca na ordem de chegada). Respostas em papel contam na participação, mas o
  conteúdo está nos anexos.
- BFF: `report.csv` (uma linha por resposta digital; separador `;` e BOM para o Excel; valores
  iniciados por `= + - @` recebem apóstrofo contra injeção de fórmula; em formulário anônimo, sem
  nome, e-mail nem data, e linhas ordenadas pelo conteúdo) e `report.pdf` (consolidado, `pdfkit`).

### Envio, entrega e LGPD

- Envio com mensagem opcional e **lembrete aos pendentes** (`kind: REMINDER`): só convites
  pendentes recebem (link novo); quem entrou nos grupos depois recebe pelo reenvio.
- O reenvio só alcança quem dos grupos ainda não respondeu (pelo link ou em papel). O formulário
  expõe `pendingRecipientCount`; com zero, a interface esconde o reenvio e a Core API recusa o envio
  (409, `no_pending_recipients`).
- O PDF para impressão traz um **QR code** do link pessoal (`qrcode` no BFF) e as perguntas
  obrigatórias marcadas.
- **Situação de entrega**: o BFF guarda o ID da mensagem do Resend por convite; o webhook
  `POST /api/v1/webhooks/resend` (assinatura Svix conferida com `RESEND_WEBHOOK_SECRET`, corpo bruto
  habilitado no BFF) repassa os eventos à Core API (`POST /form-email-events`). A situação só avança
  (enviado, atrasado, entregue, aberto, clicado); devolvido, spam e falha prevalecem. Sem o segredo, o
  webhook fica desligado.
- Página de resposta: **rascunho automático** no navegador (localStorage, chave = SHA-256 do token,
  validade de 30 dias) e **cópia das respostas em PDF por e-mail** (opcional, marcada por padrão).
- **Limite de requisições** nas rotas públicas de resposta: 30 consultas e 10 envios por minuto por
  endereço (primeiro valor de X-Forwarded-For), em memória por instância.
- **Apagar respostas** (`DELETE /forms/:id/answers`), só com o formulário finalizado ou cancelado:
  remove respostas digitais, anônimas e anexos; a participação continua registrada.

## Justificativa

- Grupos de e-mails servem a outras comunicações além dos formulários; ficam em um contexto próprio,
  e Forms depende só do contrato público.
- Guardar IDs de contas (e não e-mails) evita cópias desatualizadas quando a pessoa troca o e-mail;
  a lista de contas elegíveis vem do BFF, dono das contas (ADR 0003 e 0008).
- Perguntas em `jsonb` refletem o Aggregate: são sempre lidas e gravadas com o formulário, e as
  regras ficam no Domain, não no banco.

## Consequências

- Migration `0006_formularios_e_grupos` (Core API): schemas `communication` e `forms`.
- Regra de ciclo de vida do R2: além de `gallery/uploads/` e `members/uploads/`, apagar após 1 dia os
  objetos em `{pasta do ambiente}/forms/uploads/` (envios de imagem abandonados).
- O adaptador S3 de Forms repete a técnica dos adaptadores da galeria e do Perfil, sem compartilhar
  código entre os contextos; extrair um cliente S3 compartilhado continua pendente.
- A lista de contas elegíveis tem teto de 5.000, sem paginação (a tela troca contas entre duas
  listas). Acima disso será preciso buscar no servidor.
- Migration `0007_envio_e_respostas_formularios`: situação do último envio no formulário e tabela de
  convites com as respostas.
- As rotas públicas de resposta ainda não têm limite de requisições; o token de 256 bits torna
  inviável adivinhar links, mas um limite por IP fica recomendado antes da produção.
- O envio usa a cota do Resend (plano gratuito: 100 e-mails por dia e 3.000 por mês).
- Migration `0008_respostas_em_papel`: canal da resposta e dados do anexo no convite (respostas
  anteriores marcadas como digitais).
- Nova dependência do BFF: `pdfkit` (geração do PDF, fontes padrão; sem dependência nativa).
- A regra de ciclo de vida de `forms/uploads/` também cobre os anexos de respostas em papel
  abandonados.
- Migrations `0009_configuracoes_e_anonimato` e `0010_entrega_lembrete_e_exclusao`.
- Novas dependências do BFF: `qrcode`. Nova variável opcional: `RESEND_WEBHOOK_SECRET` (nos dois
  Blueprints). O webhook precisa ser cadastrado no painel do Resend apontando para o BFF.
- O limite de requisições é por instância e usa um cabeçalho que o cliente pode influenciar; serve
  contra abuso simples, não contra ataques distribuídos.
- Anonimato: a data da resposta anônima e a hora em que o convite foi marcado como respondido ficam
  separadas, mas com poucos respondentes ainda é possível deduzir quem respondeu em cada dia.
- Fora do escopo: histórico de quem fez cada ação (depende da propagação da identidade do BFF para a
  Core API, decisão pendente), lembretes e encerramento automáticos (exigem um processo contínuo, ainda
  não aprovado no ambiente gratuito) e retenção automática das respostas.
