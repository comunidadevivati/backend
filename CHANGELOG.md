# Changelog

## [0.7.0](https://github.com/comunidadevivati/backend/compare/backend-v0.6.0...backend-v0.7.0) (2026-10-21)


### ✨ Funcionalidades

* **gallery:** ✨ adiciona publicação de fotos e álbuns e a galeria do site público ([1f99fc9](https://github.com/comunidadevivati/backend/commit/1f99fc9323e594f45121480ecd91eaa8059e8973))
* **gallery:** ✨ publicação de fotos e álbuns e galeria do site público ([b372b76](https://github.com/comunidadevivati/backend/commit/b372b76f8a679e5ccb3b5ce460460240850dd4c6))
* **release:** ✨ promove a publicação da galeria e o site de fotos para produção ([5a64a77](https://github.com/comunidadevivati/backend/commit/5a64a77ffef257e4f0adb5b339b53375e4a2e725))


### 🐛 Correções

* **gallery:** 🐛 evita que o processamento de fotos estoure a memória da Core API ([e68ed35](https://github.com/comunidadevivati/backend/commit/e68ed3598dfb9d519a3c802a1beac2bcbf88ae6d))


### ♻️ Refatorações

* **gallery:** ♻️ deixa interno o tipo de variante da galeria pública ([8fe2a6d](https://github.com/comunidadevivati/backend/commit/8fe2a6d2bc1e4eda2c9239b7d6c60f0305c58d47))


### 👷 Integração contínua

* **tests:** 👷 pausa a execução de testes no CI e nos hooks ([380b34d](https://github.com/comunidadevivati/backend/commit/380b34d5a43f6e4b58b0df6361ef7cadecb8ed86))
* **tests:** 👷 pausa a execução de testes no CI e nos hooks ([cdc47e2](https://github.com/comunidadevivati/backend/commit/cdc47e2bcd49f96e4524cd5213a2d18e3d8fc674))

## [0.6.0](https://github.com/comunidadevivati/backend/compare/backend-v0.5.0...backend-v0.6.0) (2026-10-20)


### ✨ Funcionalidades

* **gallery:** ✨ adiciona álbuns e envio de fotos ao Cloudflare R2 ([e8f0a5e](https://github.com/comunidadevivati/backend/commit/e8f0a5e5902150b71ca94ec392a080e65c7935f5))
* **gallery:** ✨ adiciona álbuns e envio de fotos ao Cloudflare R2 ([d8985ec](https://github.com/comunidadevivati/backend/commit/d8985ece87341e9eb96677c0f8f32e2a24e7299e))
* **members:** ✨ adiciona membros e vínculos congregacionais na Core API via BFF ([0b0a4d8](https://github.com/comunidadevivati/backend/commit/0b0a4d8dc1c17011db551e70364c3736f6e69a5a))
* **members:** ✨ adiciona Pessoa, membros e vínculos congregacionais a partir de contas verificadas ([2cc9ac5](https://github.com/comunidadevivati/backend/commit/2cc9ac56c4c6288497cc6387d63a9b10722ee066))
* **members:** ✨ cria Pessoa e membro a partir de conta verificada ([6a0044e](https://github.com/comunidadevivati/backend/commit/6a0044e707ecd9cffe6bf28ba82678b8c666f96b))
* **organization:** ✨ adiciona organização e congregações na Core API via BFF ([42e7a7c](https://github.com/comunidadevivati/backend/commit/42e7a7c2d922eeefbab826399b087ebc0a78cac2))
* **organization:** ✨ adiciona organização e congregações na Core API via BFF ([23a5b1d](https://github.com/comunidadevivati/backend/commit/23a5b1df071eacb72e183bbe8274ed87c75bb40c))
* **release:** ✨ promove organização, usuários, membros e galeria para produção ([cb83f36](https://github.com/comunidadevivati/backend/commit/cb83f361d066cae2a34cd5eb367d3a05f97de0f8))
* **users:** ✨ adiciona gestão de usuários no BFF com filtros e suspensão ([c91dd8d](https://github.com/comunidadevivati/backend/commit/c91dd8d5779b544cb540a3f9dc0607aba9e1aab8))
* **users:** ✨ adiciona gestão de usuários no BFF com filtros e suspensão ([91a7493](https://github.com/comunidadevivati/backend/commit/91a7493a63bbb650cec70732e4ca3b2bbc2dda36))


### 🐛 Correções

* **ci:** 🐛 executa os checks nos PRs que só alteram o changelog ([f9f9944](https://github.com/comunidadevivati/backend/commit/f9f99444fbf44bcb0bcb7a7b77a237d69edc7bf0))
* **ci:** 🐛 executa os checks nos PRs que só alteram o changelog ([83a8004](https://github.com/comunidadevivati/backend/commit/83a80043a7b69a125189f7c277e418158c07ac0d))


### 🔧 Manutenção

* **git:** 🔧 sincroniza a release 0.5.0 na homologation ([2e9a7bf](https://github.com/comunidadevivati/backend/commit/2e9a7bf4ae4ffc90744709b773a2c763d1cc2a09))
* **members:** 🔧 integra a homologation com a gestão de usuários na feat/membros ([4d9c427](https://github.com/comunidadevivati/backend/commit/4d9c4279d2def155bb44eb53a25434522145b018))

## [0.5.0](https://github.com/comunidadevivati/backend/compare/backend-v0.4.1...backend-v0.5.0) (2026-10-18)


### ✨ Funcionalidades

* **auth:** ✨ promove login, recuperação e verificação de e-mail para produção ([bc2078c](https://github.com/comunidadevivati/backend/commit/bc2078c5bfb86538f4085e05bb9f61bb2f427637))


### 📝 Documentação

* **deploy:** 📝 documenta merge commit obrigatório na homologation ([c3341af](https://github.com/comunidadevivati/backend/commit/c3341afcf8f211a5807904134ba900e4132ec850))


### 👷 Integração contínua

* **release:** 👷 mescla o PR de release com merge commit ([#24](https://github.com/comunidadevivati/backend/issues/24)) ([2aff3e1](https://github.com/comunidadevivati/backend/commit/2aff3e1381f9da181b19f692ac6245542ada8639))


### 🔧 Manutenção

* **git:** 🔧 incorpora o histórico da main na homologation ([239649f](https://github.com/comunidadevivati/backend/commit/239649fad4e073030032ef1683eab16d32f1968e))
* **git:** 🔧 incorpora o histórico da main na homologation ([d9f3897](https://github.com/comunidadevivati/backend/commit/d9f3897cd35224786bbd6eb0a544b802a86352f0))
* **git:** 🔧 sincroniza main na homologation ([#23](https://github.com/comunidadevivati/backend/issues/23)) ([77f9a86](https://github.com/comunidadevivati/backend/commit/77f9a86a7f5c5eb81047698172ff972d3e338d0b))

## [0.4.1](https://github.com/comunidadevivati/backend/compare/backend-v0.4.0...backend-v0.4.1) (2026-10-18)


### 🔧 Manutenção

* **release:** 🔧 promove homologação para produção ([#21](https://github.com/comunidadevivati/backend/issues/21)) ([c787d9c](https://github.com/comunidadevivati/backend/commit/c787d9c1ce6523ab00e7a285e746ca7a395e9d26))

## [0.4.0](https://github.com/comunidadevivati/backend/compare/backend-v0.3.2...backend-v0.4.0) (2026-10-15)


### ✨ Funcionalidades

* **keycloak:** ✨ adiciona tema visual da Comunidade Viva ([cc91554](https://github.com/comunidadevivati/backend/commit/cc9155455afa5184bf3faa44daa054047a3ea013))

## [0.3.2](https://github.com/comunidadevivati/backend/compare/backend-v0.3.1...backend-v0.3.2) (2026-10-15)


### 🐛 Correções

* **render:** 🐛 corrige parâmetros de memória do Keycloak ([#15](https://github.com/comunidadevivati/backend/issues/15)) ([42729fe](https://github.com/comunidadevivati/backend/commit/42729fe4cddead08081f35290838205f8a4c7397))

## [0.3.1](https://github.com/comunidadevivati/backend/compare/backend-v0.3.0...backend-v0.3.1) (2026-10-14)


### 👷 Integração contínua

* **render:** 👷 adota infraestrutura gratuita para MVP ([#13](https://github.com/comunidadevivati/backend/issues/13)) ([839702e](https://github.com/comunidadevivati/backend/commit/839702e5f68fe52431894b08e9f6f1033c480c21))

## [0.3.0](https://github.com/comunidadevivati/backend/compare/backend-v0.2.1...backend-v0.3.0) (2026-10-14)


### ✨ Funcionalidades

* **backend:** ✨ entrega sessão segura e PoC Cloudflare Containers ([#11](https://github.com/comunidadevivati/backend/issues/11)) ([c40d8b2](https://github.com/comunidadevivati/backend/commit/c40d8b253f94120ddbd1a9a87bc882126ca48438))

## [0.2.1](https://github.com/comunidadevivati/backend/compare/backend-v0.2.0...backend-v0.2.1) (2026-10-11)


### 👷 Integração contínua

* **release:** 👷 ignora o Backend CI em PRs de release ([#8](https://github.com/comunidadevivati/backend/issues/8)) ([ebe0795](https://github.com/comunidadevivati/backend/commit/ebe0795ec195d7dedc7420d54a9e967acc4af047))

## [0.2.0](https://github.com/comunidadevivati/backend/compare/backend-v0.1.2...backend-v0.2.0) (2026-10-11)


### ✨ Funcionalidades

* **bff:** ✨ implementa autenticação OIDC com Keycloak e sessões Redis ([ac53667](https://github.com/comunidadevivati/backend/commit/ac536679f81e31df3ce83e658faad4afd1dd4164))
* **bff:** ✨ implementa autenticação OIDC e sessões Redis ([4cc06fc](https://github.com/comunidadevivati/backend/commit/4cc06fc31c33edb28ec8da5d371605a3513ba127))


### 🐛 Correções

* **bff:** 🐛 remove export não utilizado do schema de ambiente ([0807af4](https://github.com/comunidadevivati/backend/commit/0807af441849275ca72176c98977682e7fa3955d))


### 📝 Documentação

* **agents:** 📝 registra bloco de orientação do Turborepo para agentes ([5b157a1](https://github.com/comunidadevivati/backend/commit/5b157a1d0dbbf97aa004d307567d0807cec73429))


### 🧪 Testes

* **auth:** 🧪 adiciona testes de sessões e autenticação ([07492db](https://github.com/comunidadevivati/backend/commit/07492db61188f9d90d0c1eabf3ecfc4fdbccabda))
* **bff:** 🧪 adiciona testes unitários de autenticação e infraestrutura ([3150b5d](https://github.com/comunidadevivati/backend/commit/3150b5dc0bc10d3dd548c390342d5888274578d7))


### 👷 Integração contínua

* **release:** 👷 automatiza publicação de releases e aceita branches release/X.Y.Z ([#7](https://github.com/comunidadevivati/backend/issues/7)) ([49c19ad](https://github.com/comunidadevivati/backend/commit/49c19ad0d41c8141b67653323c546ed4ebe8affb))


### 🔧 Manutenção

* **infra:** 🔧 configura serviços Docker da plataforma ([9ded846](https://github.com/comunidadevivati/backend/commit/9ded846f98d1cac814fa0e7b96a70c733ceb4a29))

## [0.1.2](https://github.com/comunidadevivati/backend/compare/backend-v0.1.1...backend-v0.1.2) (2026-10-10)


### 🐛 Correções

* **ci:** 🐛 atualizar Node.js e proteger os nomes das branches ([dfcdf1a](https://github.com/comunidadevivati/backend/commit/dfcdf1a68315e02a504b4f991aab165e955a3a8d))
* **husky:** 🐛 corrigir quebras de linha dos hooks no Windows ([22bb878](https://github.com/comunidadevivati/backend/commit/22bb878b193d0b2f7ae35c2cfd14dfd1b026e4cd))
* **husky:** 🐛 corrigir quebras de linha dos hooks no Windows ([fffcea9](https://github.com/comunidadevivati/backend/commit/fffcea9a60d43d5ce6619d5be99796dae6120542))

## [0.1.1](https://github.com/comunidadevivati/backend/compare/backend-v0.1.0...backend-v0.1.1) (2026-10-10)


### 🐛 Correções

* **formatacao:** 🐛 preservar changelog gerado automaticamente ([725758f](https://github.com/comunidadevivati/backend/commit/725758fa57c96dbdb5edb0d1cddb49b4250309c5))


### 👷 Integração contínua

* **backend:** 👷 automatizar validações de qualidade e segurança ([0909d31](https://github.com/comunidadevivati/backend/commit/0909d31a83622ce2bb97ec2ab8ba58364b2fc3d6))
* **github-actions:** 👷 modernizar o ambiente de execução da esteira ([ea9ee3c](https://github.com/comunidadevivati/backend/commit/ea9ee3cd996db072c481bf417d0e451a173bddc4))
* **releases:** 👷 automatizar versionamento semântico e changelog ([da58972](https://github.com/comunidadevivati/backend/commit/da58972a7568fb221c783f1a55bd2956a412f4c9))


### 🔧 Manutenção

* **estrutura:** 🔧 consolidar a infraestrutura inicial do backend ([98bbcb9](https://github.com/comunidadevivati/backend/commit/98bbcb9acc84a195c2aa956798bb0e12ee2b95d6))
