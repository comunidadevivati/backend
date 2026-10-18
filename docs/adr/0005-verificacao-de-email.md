# ADR 0005 — Verificação de e-mail do cadastro

- Status: Accepted
- Data: 2026-10-18
- Complementa: [ADR 0003](0003-autenticacao-email-senha-postgresql.md) e
  [ADR 0004](0004-recuperacao-de-senha-com-resend.md)

## Contexto

O cadastro público do ADR 0003 cria a conta e abre a sessão sem comprovar que a pessoa controla o
e-mail informado. A aplicação precisa saber se o e-mail foi confirmado para, no futuro, limitar o
acesso a menus e informações de contas não verificadas.

## Decisão

- `auth.users.email_verified_at` registra a confirmação; nulo significa e-mail não verificado. Todas
  as contas, inclusive as criadas antes desta decisão, começam sem verificação.
- `auth.email_verification_tokens` guarda somente o SHA-256 de um token aleatório de 32 bytes, com
  validade de 24 horas (`EMAIL_VERIFICATION_TTL_HOURS`) e uso único. Um novo envio invalida os links
  anteriores, com intervalo mínimo de 60 segundos por conta (`EMAIL_VERIFICATION_COOLDOWN_SECONDS`).
- O cadastro envia o primeiro link pelo Resend (mesma porta e layout do ADR 0004). Uma falha no envio
  não desfaz o cadastro.
- `POST /auth/email-verification` é público: o link pode ser aberto em outro navegador ou aparelho.
- `POST /auth/email-verification/resend` exige sessão e token CSRF e envia somente para o e-mail da
  própria sessão.
- Login, cadastro, redefinição de senha e `GET /auth/me` expõem `user.emailVerified`.
- No frontend, conta não verificada exibe o badge "Não verificado" no menu da conta, a opção de
  reenvio e somente o menu Dashboard, que mostra apenas o aviso de conta não verificada.

## Consequências

- O BFF passa a ter a informação necessária para restringir menus e dados por verificação de e-mail.
  A restrição atual é aplicada na interface; endpoints futuros que exponham dados devem validar
  `emailVerified` também no servidor, sem confiar apenas no frontend.
- A redefinição de senha não marca o e-mail como verificado, mantendo os fluxos independentes.
- Contas criadas pelo CLI administrativo também nascem sem verificação.
