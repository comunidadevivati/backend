# ADR 0004 — Recuperação de senha com Resend

- Status: Accepted
- Data: 2026-10-18
- Complementa: [ADR 0003](0003-autenticacao-email-senha-postgresql.md)

## Contexto

O login local definido no ADR 0003 precisa de um fluxo de recuperação que não revele quais
endereços possuem conta, não armazene o token em texto puro e possa operar na topologia gratuita do
MVP. O worker contínuo está adiado, portanto ainda não existe uma fila própria para envio assíncrono.

## Decisão

- Adotar o Resend como provedor de e-mail transacional, acessado por uma porta da camada de
  aplicação e por um adapter HTTP na infraestrutura do BFF.
- Usar `mail.comvivaeficaz.com.br` como subdomínio de envio e
  `seguranca@mail.comvivaeficaz.com.br` como remetente inicial, após a verificação dos registros DNS.
- `POST /auth/password-recovery` sempre responde `200` com a mesma mensagem, inclusive para e-mail
  malformado, inexistente ou conta suspensa.
- Para contas ativas, gerar um token aleatório de 32 bytes, enviar apenas o valor original no link e
  persistir somente seu SHA-256.
- O token expira em 15 minutos, é de uso único e uma nova emissão invalida links ativos anteriores.
- Aplicar cooldown de 60 segundos por conta. Controles adicionais por IP/origem devem ser aplicados
  no proxy de borda antes de produção.
- `POST /auth/password-reset` valida o token e a política de senha, troca o hash dentro de uma
  transação e revoga todas as sessões do usuário.
- Manter `EMAIL_PROVIDER=disabled` para desenvolvimento sem envio externo. Ambientes que devem
  enviar e-mail configuram `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` como secrets.
- Enviar de forma síncrona nesta primeira versão, com timeout curto e resposta pública neutra mesmo
  quando o provedor falhar. A migração para outbox/fila exige uma decisão posterior sobre execução
  assíncrona.

## Segurança e privacidade

- E-mail, token e credenciais do Resend não são registrados em logs.
- Respostas diferentes não revelam a existência de uma conta.
- O frontend remove o token da barra de endereço após capturá-lo e usa política de referrer
  `no-referrer` na página de redefinição.
- Chaves do Resend permanecem somente no BFF e nunca usam prefixo `VITE_`.
- A telemetria de abertura e clique deve permanecer desabilitada para mensagens de recuperação,
  reduzindo coleta desnecessária e evitando reescrita do link.

## Consequências

- O BFF passa a depender da disponibilidade do Resend durante a solicitação enquanto não houver
  outbox. Falhas não expõem detalhes ao usuário, mas precisam ser monitoradas.
- O plano gratuito atende ao MVP dentro das cotas do provedor, sem representar SLA ou aprovação da
  topologia para produção.
- A tabela `auth.password_reset_tokens` passa a fazer parte do schema do BFF.
- Webhooks assinados para entrega, bounce e reclamações, além de retries duráveis, ficam para uma
  etapa posterior.

## Alternativas consideradas

- Amazon SES: boa escala e custo, porém maior complexidade operacional para o MVP.
- Postmark: excelente foco transacional, mas menos aderente ao objetivo de custo zero inicial.
- SendGrid e Mailgun: maduros, porém com experiência operacional e planos menos favoráveis para o
  estágio atual.
- SMTP próprio: descartado por entregabilidade, reputação, segurança e carga operacional.
