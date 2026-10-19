# ADR 0008 — Gestão de usuários (contas de acesso) no BFF

- Status: Proposed (implementado provisoriamente para o MVP; aguarda aprovação)
- Data: 2026-10-19

## Contexto

As contas de acesso ficam no BFF, no schema `auth` (ADR 0003), criadas pelo cadastro público ou
pelo CLI. Não havia como consultar, cadastrar ou manter contas pela aplicação web. A direção do
projeto pediu um menu "Usuários" para listar as contas (com a informação de e-mail verificado),
editar, excluir e cadastrar pessoas com os mesmos dados e o mesmo fluxo do cadastro da tela de
login. Esse cadastro será a base para, depois, transformar uma conta em membro.

## Decisão

- **Rotas no BFF** em `/api/v1/users` (módulo `UserManagementModule`, dentro de `auth`), com acesso
  direto ao schema `auth`, dono das contas. A Core API não participa.
- **Acesso provisório**, como no ADR 0006: sessão válida com e-mail verificado e `X-CSRF-Token`
  nas alterações. Uma conta não pode suspender nem excluir a si mesma.
- **Cadastro**: o mesmo contrato e as mesmas regras de `POST /auth/register` (nome, telefone,
  e-mail e senha forte). A conta nasce `ACTIVE` com e-mail não verificado e recebe o link de
  verificação. Diferente do cadastro público, **não abre sessão** para a nova conta: a sessão de
  quem cadastra é preservada.
- **Edição**: nome, telefone e e-mail. Trocar o e-mail volta a conta para "não verificada", apaga
  os links de verificação pendentes, invalida os links de redefinição de senha emitidos para o
  endereço anterior e envia um novo link ao endereço novo. A senha não é alterada por aqui.
- **Excluir** tem duas formas: **suspender/reativar** (status `SUSPENDED` já existente, que bloqueia
  o login e encerra as sessões) para qualquer conta, e **exclusão definitiva** somente para contas
  que nunca verificaram o e-mail (cadastros abandonados). Conta verificada pode ser suspensa.
- **Listagem** filtra por situação (`status`) e por verificação do e-mail (`emailVerified`), de
  forma combinável, e informa o momento da suspensão (`suspendedAt`, coluna
  `auth.users.suspended_at`). Para contas suspensas antes dessa coluna, a migration usa a data da
  última alteração como aproximação.
- **Conflitos** (`409`) trazem um `code` estável (`email_taken`, `self_action`,
  `verified_account`) além da mensagem.

## Justificativa

Usa o modelo de contas existente sem antecipar o contexto Identity nem a autorização por papéis.
Preservar contas verificadas (suspensão em vez de exclusão) mantém o histórico e futuros vínculos
com membros; apagar somente cadastros nunca confirmados evita acúmulo de contas abandonadas.

## Consequências

- Qualquer conta com e-mail verificado pode cadastrar, editar, suspender e excluir outras contas.
  É aceitável apenas em homologação: o contexto Authorization precisa restringir a gestão antes de
  produção.
- Quem cadastra conhece a senha inicial da pessoa (mesmo fluxo do cadastro público). A pessoa pode
  trocá-la pela recuperação de senha.
- Não há controle otimista de versão nas contas: alterações simultâneas prevalecem pela última
  gravação.
- O vínculo entre conta e membro (Identity) continua pendente e será tratado com o contexto Members.

## Alternativas consideradas

- Reutilizar `POST /auth/register`: descartado, pois troca a sessão de quem cadastra pela da conta
  nova.
- Cadastro sem senha, com link para a pessoa criar a própria senha: preferível para segurança, mas
  a direção do projeto optou pelo mesmo fluxo do cadastro público.
- Exclusão definitiva de qualquer conta: descartada; perderia histórico e quebraria vínculos.
