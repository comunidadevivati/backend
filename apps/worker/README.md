# Worker — Comunidade Viva e Eficaz

## 1. Objetivo

O Worker é uma aplicação Node.js independente, responsável pelo processamento assíncrono de tarefas da plataforma.

Tecnologias aprovadas:

- NestJS
- TypeScript
- BullMQ
- Redis
- PostgreSQL 18, quando necessário
- OpenTelemetry
- Pino

O Worker integra o monorepo pnpm Workspaces + Turborepo, com build e deploy independentes.

## 2. Responsabilidades

O Worker deve:

- Processar jobs assíncronos.
- Executar tarefas agendadas com BullMQ Job Schedulers.
- Processar eventos de integração.
- Consumir mensagens com segurança.
- Implementar retries controlados.
- Aplicar idempotência.
- Utilizar Dead Letter Queue ou quarentena conforme a necessidade.
- Permitir reprocessamento controlado.
- Registrar logs, métricas e traces.
- Suportar execução contínua e escalabilidade independente.

## 3. Responsabilidades proibidas

O Worker não deve:

- Duplicar regras de domínio da Core API.
- Acessar arbitrariamente tabelas de outros Bounded Contexts.
- Importar implementações internas de apps/core-api.
- Compartilhar sessões HTTP com o BFF.
- Confiar em dados de jobs sem validação.
- Registrar credenciais ou dados sensíveis nos logs.
- Executar operações críticas sem mecanismos de idempotência.
- Depender exclusivamente de processamento em memória.

## 4. Estrutura arquitetural de referência

src/
├── jobs/
│ ├── processors/
│ ├── schedulers/
│ └── contracts/
├── events/
│ ├── consumers/
│ └── contracts/
├── infrastructure/
│ ├── redis/
│ ├── persistence/
│ └── integrations/
├── observability/
├── config/
├── shared/
└── main.ts

A estrutura poderá ser refinada conforme os jobs e contratos efetivamente implementados.

## 5. Processamento com BullMQ

Redis é o backend aprovado para as filas BullMQ.

Cada fila deverá possuir:

- Nome estável e descritivo.
- Responsabilidade explícita.
- Contrato de payload versionado quando necessário.
- Validação dos dados recebidos.
- Política de tentativas.
- Backoff apropriado.
- Timeout ou limite de execução quando aplicável.
- Estratégia de idempotência.
- Política de retenção de resultados.
- Métricas e alertas.

Não criar uma fila diferente para cada operação sem necessidade técnica.

## 6. Jobs

Os jobs devem representar tarefas assíncronas específicas.

Exemplos futuros:

- Envio de notificações.
- Processamento de documentos.
- Processamento de eventos de integração.
- Reconciliação de provisionamento de identidades.
- Tarefas periódicas de manutenção.

Esses exemplos não representam funcionalidades aprovadas para implementação imediata.

## 7. Contratos de jobs

Cada tipo de job deverá documentar:

- Nome.
- Versão, quando necessária.
- Objetivo.
- Produtor.
- Consumidor.
- Payload permitido.
- Critérios de validação.
- Chave de idempotência.
- Política de tentativas.
- Condições de sucesso.
- Condições de falha.
- Política de retenção.

O payload deve ser mínimo e não conter segredos.

Preferir referências estáveis a recursos em vez de copiar Aggregates completos.

## 8. Domain Events e Integration Events

Domain Events pertencem aos respectivos Bounded Contexts.

O Worker não deverá assumir ownership dos eventos internos de domínio.

Integration Events devem:

- Possuir contratos explícitos.
- Ser versionados quando necessário.
- Possuir identificador de evento.
- Permitir rastreabilidade.
- Suportar processamento idempotente.
- Ser publicados somente quando houver necessidade concreta de integração durável.

O Worker poderá consumir Integration Events sem importar entidades internas da Core API.

## 9. Transactional Outbox

A arquitetura utiliza Transactional Outbox para publicações duráveis.

Regras:

- Persistir eventos de integração na mesma transação da mudança de negócio.
- Publicar eventos pendentes por mecanismo recuperável.
- Evitar perda de eventos após commit.
- Registrar tentativas e falhas.
- Permitir recuperação após interrupções.

O acesso do Worker à Outbox deverá ocorrer por contrato ou adapter de infraestrutura explicitamente autorizado.

Não conceder acesso irrestrito aos schemas de negócio.

## 10. Inbox e deduplicação

Consumidores críticos deverão utilizar Inbox ou mecanismo equivalente.

Regras:

- Identificar mensagens por EventId ou chave equivalente.
- Evitar repetição de efeitos de negócio.
- Registrar processamento confirmado.
- Tratar mensagens duplicadas.
- Tratar mensagens fora de ordem quando relevante.

A entrega de uma mensagem não deve ser interpretada como execução exatamente uma vez.

## 11. Retries e tratamento de falhas

Aplicar retries somente quando a falha for potencialmente transitória.

Utilizar:

- Backoff exponencial.
- Número máximo de tentativas.
- Limites de execução.
- Classificação de erros.
- Dead Letter Queue ou quarentena.
- Reprocessamento administrativo controlado.

Erros permanentes de validação não devem provocar tentativas infinitas.

Operações com efeitos externos devem utilizar idempotência e, quando necessário, reconciliação.

## 12. Tarefas agendadas

Utilizar BullMQ Job Schedulers.

Regras:

- Configuração explícita.
- Identificadores estáveis.
- Controle de concorrência.
- Proteção contra execução duplicada.
- Timezone documentado quando relevante.
- Recuperação após interrupções.

Evitar depender de timers em memória para tarefas críticas.

## 13. Comunicação com a Core API

O Worker pode necessitar executar operações de aplicação.

Nesses casos:

- Utilizar contratos explícitos.
- Autenticar sua identidade técnica.
- Aplicar permissões de serviço.
- Propagar CorrelationId.
- Utilizar timeouts.
- Validar respostas.
- Respeitar políticas de idempotência.

Não representar uma service account como se fosse um usuário humano.

Não importar Use Cases ou repositories diretamente de apps/core-api.

## 14. Persistência

O Worker não é proprietário dos dados de domínio da Core API.

Quando precisar armazenar informações operacionais, utilizar infraestrutura e contratos específicos.

Não executar migrations de domínios pertencentes a outras aplicações.

O acesso a PostgreSQL deve seguir o princípio do menor privilégio.

## 15. Segurança

- Segredos fora do código-fonte.
- Conexões Redis autenticadas e criptografadas.
- Credenciais independentes por ambiente.
- Privilégios mínimos.
- Validação de payloads.
- Proteção contra replay.
- Controle de concorrência.
- Logs sem dados sensíveis desnecessários.
- Auditoria para reprocessamentos críticos.

## 16. Observabilidade

Utilizar:

- OpenTelemetry.
- Pino.
- CorrelationId.
- Métricas de jobs processados.
- Métricas de jobs com falha.
- Tempo de processamento.
- Tamanho e atraso das filas.
- Quantidade de retries.
- Volume de mensagens em quarentena.

Alertas deverão considerar falhas persistentes e atrasos relevantes.

## 17. Infraestrutura e deploy

O Worker exige infraestrutura de execução contínua. Seu deploy remoto está postergado durante a
fase de MVP e homologação com custo zero, porque os serviços web gratuitos adotados dormem por
inatividade e não sustentam com segurança o consumidor BullMQ.

Requisitos:

- Build independente.
- Deploy independente.
- Execução contínua.
- Encerramento gracioso.
- Recuperação após reinício.
- Escalabilidade independente.
- Healthchecks apropriados.
- Observabilidade operacional.

CI/CD:

- GitHub Actions.
- GHCR.
- Imagens versionadas e promovidas por digest.

A infraestrutura contínua definitiva ainda será escolhida. Não simular produção com timers ou
polling em serviços serverless que possam ser suspensos.

## 18. Testes

Utilizar:

- Vitest.
- Testes unitários de processors.
- Testes de contratos de jobs.
- Testes de integração com Redis.
- Testcontainers quando aplicável.
- Testes de idempotência.
- Testes de retries.
- Testes de mensagens duplicadas.
- Testes de mensagens fora de ordem.
- Testes de recuperação após reinício.

## 19. Evolução

Novas filas e processors serão adicionados somente quando houver necessidade real de processamento assíncrono.

A lógica de negócio continuará sob ownership dos respectivos Bounded Contexts.

Mudanças relevantes na arquitetura devem ser registradas em docs/adr/.
