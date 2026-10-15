# Deploy gratuito do backend para MVP e homologação

## 1. Escopo

Esta topologia mantém custo mensal zero enquanto o uso permanecer dentro das cotas gratuitas:

- frontend: Cloudflare Workers Static Assets;
- Core API, BFF e Keycloak: serviços web gratuitos no Render;
- PostgreSQL do Keycloak: Neon Free;
- sessões do BFF: Upstash Redis Free;
- CI: GitHub Actions;
- deploy: Render Blueprint conectado à branch `main` após os checks do CI.

Os serviços gratuitos possuem cold start, limites de uso e ausência de SLA. Esta configuração é
destinada somente a MVP e homologação, não a produção.

## 2. Topologia

```text
Navegador
    |
    v
Frontend Cloudflare ── /auth/* ──> BFF Render ──> Keycloak Render
                                      |       |              |
                                      v       v              v
                               Core API   Upstash Redis   Neon PostgreSQL
```

O frontend chama `/auth/*` na própria origem. Seu Worker encaminha essas rotas à origem pública do
BFF definida no secret `BFF_ORIGIN`. Isso permite que o navegador receba o cookie HttpOnly na
origem do frontend, sem expor tokens OIDC ao JavaScript.

O Worker BullMQ não faz parte desta implantação. Ele exige execução contínua e permanece postergado
até existir uma alternativa compatível com o requisito de custo zero ou uma nova decisão
arquitetural.

## 3. Artefatos

| Componente | Artefato                     |
| ---------- | ---------------------------- |
| Blueprint  | `render.yaml`                |
| BFF        | `apps/bff/Dockerfile`        |
| Core API   | `apps/core-api/Dockerfile`   |
| Keycloak   | `deploy/keycloak/Dockerfile` |
| Tema OIDC  | `deploy/keycloak/themes`     |

Os três containers escutam na porta `10000`. O Keycloak é construído antecipadamente com suporte a
PostgreSQL e cache local de nó único para reduzir seu tempo de inicialização e consumo de memória.
O heap e o pool HTTP são limitados porque o serviço gratuito possui apenas 512 MB.

## 4. Preparar PostgreSQL no Neon

Crie um projeto gratuito dedicado ao Keycloak. Não reutilize o banco de domínio da Core API.

Separe os dados da conexão fornecidos pelo Neon nos valores abaixo:

| Variável do Render | Valor esperado                                    |
| ------------------ | ------------------------------------------------- |
| `KC_DB_URL`        | `jdbc:postgresql://HOST/DATABASE?sslmode=require` |
| `KC_DB_USERNAME`   | usuário do banco                                  |
| `KC_DB_PASSWORD`   | senha do banco                                    |

Use o endpoint com pooling quando ele estiver disponível e limite o pool do Keycloak. O Blueprint
configura no máximo cinco conexões. Nunca adicione a URL ou as credenciais ao Git.

## 5. Preparar Redis no Upstash

Crie um banco Redis gratuito e copie a URL TLS nativa no formato:

```text
rediss://default:TOKEN@HOST:6379
```

Esse valor será o secret `REDIS_URL` do BFF no Render. A cota gratuita é compartilhada entre
sessões e qualquer uso futuro; o Worker BullMQ não deve ser iniciado nesta etapa porque seu polling
contínuo consumiria a cota rapidamente.

## 6. Criar o Blueprint no Render

Antes de criar o Blueprint, Neon e Upstash devem estar provisionados.

1. No Render, escolha **New > Blueprint**.
2. Conecte `https://github.com/comunidadevivati/backend`.
3. Selecione a branch `main` e o arquivo `render.yaml`.
4. Mantenha o plano `free` dos três serviços.
5. Informe os valores solicitados com `sync: false`.

### Segredos solicitados

| Serviço  | Variável                      | Conteúdo                             |
| -------- | ----------------------------- | ------------------------------------ |
| Keycloak | `KC_DB_URL`                   | JDBC URL do Neon                     |
| Keycloak | `KC_DB_USERNAME`              | usuário do Neon                      |
| Keycloak | `KC_DB_PASSWORD`              | senha do Neon                        |
| Keycloak | `KC_BOOTSTRAP_ADMIN_PASSWORD` | senha administrativa aleatória       |
| BFF      | `KEYCLOAK_CLIENT_SECRET`      | segredo do client criado no Keycloak |
| BFF      | `SESSION_ENCRYPTION_KEY`      | chave Base64URL de 32 bytes          |
| BFF      | `REDIS_URL`                   | URL TLS nativa do Upstash            |

Gere os valores aleatórios localmente:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use uma execução para `SESSION_ENCRYPTION_KEY` e outra para a senha administrativa. O
`COOKIE_SECRET` é gerado pelo próprio Render.

O primeiro deploy do BFF pode falhar enquanto o Keycloak ainda estiver inicializando. Aguarde o
health check do Keycloak ficar verde e execute **Manual Deploy > Deploy latest commit** no BFF.

## 7. Configurar o Keycloak

Acesse `https://comvivati-keycloak.onrender.com/admin` com o administrador criado no Blueprint.

1. Crie o realm `comunidade-viva`.
2. Crie o client confidencial `comvivati-bff`.
3. Habilite Authorization Code/Standard Flow.
4. Cadastre a redirect URI exata:
   `https://comunidade-viva-web.comvivati.workers.dev/auth/callback`.
5. Cadastre a web origin exata:
   `https://comunidade-viva-web.comvivati.workers.dev`.
6. Copie o client secret para `KEYCLOAK_CLIENT_SECRET` no BFF.
7. Reimplante o BFF.
8. Após o deploy da imagem que contém o tema, acesse **Realm settings > Themes**, selecione
   `comvivati` em **Login theme** e salve. O formulário continua sendo servido com segurança pelo
   Keycloak, mas preserva a identidade visual da aplicação.

O issuer esperado é:

```text
https://comvivati-keycloak.onrender.com/realms/comunidade-viva
```

## 8. Conectar o frontend ao BFF

No projeto Cloudflare do frontend, cadastre o secret:

```text
BFF_ORIGIN=https://comvivati-bff.onrender.com
```

Depois, reimplante o frontend. Não coloque esse valor em uma variável `VITE_*`; o proxy é executado
no Worker e a aplicação continua consumindo caminhos relativos na mesma origem.

As três variáveis públicas do BFF permanecem com a origem do frontend:

```text
BFF_BASE_URL=https://comunidade-viva-web.comvivati.workers.dev
BFF_OIDC_CALLBACK_URL=https://comunidade-viva-web.comvivati.workers.dev/auth/callback
WEB_BASE_URL=https://comunidade-viva-web.comvivati.workers.dev
```

## 9. Deploy automático

Cada serviço do Blueprint usa:

```yaml
branch: main
autoDeployTrigger: checksPass
```

Após um merge na `main`, o Render aguarda os checks do GitHub e publica os serviços afetados. O
Blueprint também é sincronizado quando `render.yaml` muda.

## 10. Validação

Valide primeiro os endpoints públicos:

```text
https://comvivati-core-api.onrender.com/api/v1/health
https://comvivati-bff.onrender.com/health
https://comvivati-keycloak.onrender.com/realms/comunidade-viva/.well-known/openid-configuration
```

Depois valide o fluxo real:

1. Abra o frontend em uma janela anônima.
2. Acesse `/login` e inicie a autenticação.
3. Confirme o redirecionamento ao Keycloak e o retorno por `/auth/callback`.
4. Confirme que `/auth/me` retorna a sessão sem expor tokens.
5. Execute logout e confirme remoção da sessão no Redis e do cookie no navegador.

Não considere a integração comprovada apenas com health checks ou testes unitários.

## 11. Limites conhecidos

- Serviços Render Free dormem após inatividade e podem demorar para responder no primeiro acesso.
- A franquia de horas é compartilhada pelos serviços gratuitos do workspace.
- O plano gratuito não oferece SLA adequado à produção.
- Os 512 MB do Render Free ficam abaixo do mínimo de 750 MB recomendado pelo Keycloak. Mesmo com
  heap e threads reduzidos, o serviço pode ser encerrado por falta de memória.
- Atingir cotas pode suspender serviços ou bloquear comandos até o próximo ciclo.
- Alterações no nome público de qualquer serviço exigem atualizar URLs do BFF, Keycloak e frontend.
- O deploy do Worker BullMQ continua pendente.
