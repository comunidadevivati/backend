# ADR 0009 — Pessoa e membro a partir de conta verificada

- Status: Proposed (implementado provisoriamente para o MVP; aguarda aprovação)
- Data: 2026-10-19

## Contexto

O ADR 0007 colocou os dados pessoais dentro do membro (PersonProfile pertence a Member) e deixou
para depois o vínculo entre conta digital e membro. A direção do projeto definiu que existe um único
cadastro de cada pessoa e que ser membro é uma condição dessa pessoa, nunca um cadastro paralelo.
Também definiu que a conta de acesso deve continuar enxuta: muita gente só se cadastra (por exemplo,
para receber notícias) e nunca mais acessa, e não faz sentido guardar um cadastro completo para ela.

A regra é obrigatória e em cadeia:

1. só existe conta verificada se a conta foi cadastrada (com e-mail);
2. só existe **Pessoa** se a conta estiver com o e-mail verificado;
3. só existe **membro** se existir Pessoa.

## Decisão

- **Conta (BFF, schema `auth`)** continua como está: cadastro simplificado com nome, e-mail de
  acesso, telefone, senha, verificação e situação (ADRs 0003, 0005 e 0008). Ela guarda o vínculo com
  a Pessoa em `auth.users.person_id` (UUID, único, nulo enquanto não houver; migration
  `0005_vinculo_pessoa`). Identity é dono do vínculo; não há chave estrangeira entre schemas.
- **Pessoa (Core API, contexto Members, tabela `members.people`)** é o cadastro completo, separado
  do membro. Nasce da conta verificada, levando os dados da conta (nome, e-mail e telefone), e guarda
  o ID da conta de origem (`account_id`, único: uma Pessoa por conta). No MVP tem os mesmos campos
  pessoais de antes (nome, data de nascimento, telefone e e-mail); o restante do cadastro (foto,
  sexo, endereço, redes sociais, dependentes etc.) será definido com a tela de edição da Pessoa.
- **Membro (Core API, `members.members`)** deixa de ter dados pessoais: guarda a Pessoa
  (`person_id`, único: uma Pessoa, um membro), a situação e a versão. Os vínculos com congregações
  continuam como no ADR 0007, e futuros cargos se ligam ao membro. A API devolve o membro com os
  dados da Pessoa (`{ id, status, version, person: { id, fullName, birthDate, phone, email } }`), e a
  busca por nome usa o nome da Pessoa.
- **Conversão ("Criar membro")**: `POST /api/v1/users/members` no BFF (`{ userIds }`, 1 a 50
  contas), com a sessão com e-mail verificado e `X-CSRF-Token`. Para cada conta, com a linha da conta
  bloqueada (`SELECT ... FOR UPDATE`), o BFF confere a verificação e chama uma única rota interna da
  Core API, `POST /api/v1/members` (`{ accountId, fullName, email, phone }`), que cria **Pessoa e
  membro na mesma transação**. A rota é idempotente por conta: `201` ao criar e `200` com o mesmo
  membro quando a conta já foi convertida (inclusive em pedidos simultâneos). O BFF grava
  `person_id` e devolve o resultado de cada conta (`linked`, `already_linked`, `not_found`,
  `unverified`, `rejected` ou `unavailable`), sem que a falha de uma impeça as demais.
- **Sem cadastro nem edição direta do membro**: o BFF não expõe mais `POST` nem `PATCH` de
  `/api/v1/members`, e a Core API não tem mais `PATCH /members/:id`. Os dados pessoais serão
  editados no cadastro da Pessoa.
- **Candidatas**: `GET /api/v1/users` aceita `hasPerson=true|false` e cada conta traz `personId`.
  A tela "Criar membro" usa `emailVerified=true&hasPerson=false`.
- Como os ADRs 0007 e 0009 nunca foram implantados, a migration `0002_membros` da Core API foi
  reescrita com o modelo final, em vez de receber uma migration corretiva.

## Justificativa

Um único cadastro por pessoa evita dados duplicados e divergentes; a conta enxuta não acumula dados
de quem só se cadastrou; a Pessoa separada do membro deixa o cadastro completo e os dependentes
evoluírem sem misturar com a participação na comunidade. Ser membro de uma igreja revela convicção
religiosa (dado pessoal sensível na LGPD), mais um motivo para só criar a Pessoa quando necessário.
A idempotência por conta na Core API elimina o risco de Pessoa ou membro duplicados quando a
gravação do vínculo no BFF falha depois da criação: repetir a conversão encontra a mesma Pessoa.

## Consequências

- Esta decisão substitui "PersonProfile belongs inside Member" (CLAUDE.md/AGENTS.md e ADR 0007) por
  "Pessoa e membro são Aggregates separados; o membro referencia a Pessoa".
- Até a tela de edição da Pessoa existir, os dados pessoais de quem já é membro não são editados pela
  aplicação. A edição da conta (menu Usuários) continua alterando somente a conta; a regra de qual
  dado passa a ser da Pessoa depois da conversão (proposta: dados pessoais na Pessoa, e-mail de
  acesso e preferências de comunicação na conta) será decidida com essa tela.
- A transação do BFF fica aberta durante a chamada à Core API (limitada por `CORE_API_TIMEOUT_MS`);
  por isso o limite de 50 contas por pedido e o processamento sequencial.
- Contas suspensas, mas verificadas, também podem ser convertidas: membro e acesso são independentes.
- Como nos ADRs 0006 a 0008, qualquer conta com e-mail verificado pode converter contas até o
  contexto Authorization existir.
- Pessoas sem e-mail (crianças, idosos) não podem ser cadastradas por enquanto; o caminho previsto
  são os dependentes de uma Pessoa, a definir.
- "Quantas contas por membro" (decisão pendente) fica respondida provisoriamente como uma conta por
  Pessoa e uma Pessoa por membro.

## Alternativas consideradas

- Copiar os dados da conta para o membro (primeira versão desta decisão): descartada, pois gera dois
  cadastros da mesma pessoa.
- Cadastro completo direto na conta (BFF): descartado, pois incharia a conta de quem só se cadastrou
  e colocaria regra de negócio no BFF.
- Contexto próprio "Pessoas" na Core API: adiado; Pessoa fica no contexto Members, já aprovado no
  MVP, até haver uso fora de membros.
- Criar Pessoa e membro em duas chamadas: descartado, pois uma falha entre elas deixaria Pessoa sem
  membro.
