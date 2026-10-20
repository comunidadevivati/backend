# Documentação Técnica — Comunidade Viva e Eficaz

## 1. Objetivo

Centralizar a documentação técnica, funcional e arquitetural do backend.

A documentação deve permitir que desenvolvedores e agentes de IA compreendam:

- A arquitetura aprovada.
- As responsabilidades de cada aplicação e módulo.
- Os padrões e convenções.
- As decisões técnicas e suas justificativas.
- Os contratos entre Bounded Contexts.
- Os requisitos de segurança e infraestrutura.
- Os procedimentos de desenvolvimento e operação.

## 2. Organização

docs/
├── architecture/
│ ├── README.md
│ └── decisions/
├── standards/
│ └── README.md
├── security/
│ └── README.md
├── deployment/
│ └── README.md
├── domains/
│ └── README.md
├── adr/
│ └── README.md
└── README.md

Os diretórios serão criados conforme a necessidade.

## 3. Architecture

Documentação da arquitetura geral:

- DDD e Clean Architecture.
- Modular Monolith.
- Diagramas C4.
- Fronteiras entre aplicações.
- Dependências permitidas.
- Padrões de integração.
- Persistência e consistência.
- Eventos e processamento assíncrono.

## 4. Standards

Convenções de engenharia:

- TypeScript strict.
- Nomenclatura.
- Organização de imports.
- Oxlint e Oxfmt.
- Testes com Vitest.
- Commits semânticos.
- Versionamento SemVer.
- Padrões de revisão e qualidade.

## 5. Security

Documentação de segurança:

- Login por e-mail e senha (ADR 0003).
- Recuperação de senha com Resend (ADR 0004).
- Verificação de e-mail do cadastro (ADR 0005).
- Gestão de usuários pela aplicação web (ADR 0008).
- Pessoa e membro a partir de conta verificada; o membro referencia a Pessoa (ADR 0009).
- Galeria de fotos com Cloudflare R2: bucket único com áreas privada e pública e publicação
  controlada (ADR 0010).
- Sessões seguras.
- RBAC, ABAC e ReBAC.
- Escopos organizacionais.
- Auditoria.
- Proteção de dados pessoais.
- Gerenciamento de segredos.
- Threat modeling.

Nunca documentar senhas, tokens ou segredos em texto puro.

## 6. Deployment

Documentação operacional:

- Cloudflare Workers Static Assets para o frontend.
- Render Free para BFF e Core API durante MVP e homologação.
- Neon Free para PostgreSQL durante MVP e homologação.
- Cloudflare Workers Static Assets.
- Cloudflare R2.
- GitHub Actions.
- Render Blueprint por ambiente, conectado ao GitHub (ADR 0011).
- PostgreSQL gerenciado.
- Workers contínuos.
- Backups e Disaster Recovery.
- Observabilidade.

O procedimento executável está em [deployment/README.md](deployment/README.md), e a decisão
temporária para a etapa gratuita está registrada em
[adr/0002-infraestrutura-gratuita-mvp.md](adr/0002-infraestrutura-gratuita-mvp.md).

## 7. Domains

Especificações dos Bounded Contexts:

- Organization ([domains/organization.md](domains/organization.md); integração no ADR 0006).
- Identity.
- Authorization.
- Members ([domains/members.md](domains/members.md); decisões no ADR 0007).
- Gallery ([domains/gallery.md](domains/gallery.md); decisões no ADR 0010).

Cada domínio deverá documentar:

- Linguagem ubíqua.
- Aggregates.
- Entities e Value Objects.
- Invariantes.
- Use Cases.
- Eventos.
- Contratos públicos.
- Políticas de autorização.
- Cenários de teste.

## 8. Architecture Decision Records

Os ADRs ficam em docs/adr/.

Cada ADR deve registrar:

- Identificador.
- Título.
- Status.
- Contexto.
- Decisão.
- Justificativa.
- Consequências.
- Alternativas consideradas.
- Data da decisão.

Status recomendados:

- Proposed.
- Accepted.
- Superseded.
- Deprecated.

Decisões ainda pendentes não devem ser documentadas como Accepted.

## 9. Regras de documentação

1. Utilizar Markdown.
2. Manter linguagem técnica clara.
3. Incluir exemplos quando necessários.
4. Explicar o motivo das decisões.
5. Evitar duplicação de regras.
6. Utilizar links relativos entre documentos.
7. Atualizar a documentação junto com mudanças relevantes.
8. Não registrar segredos.
9. Identificar claramente propostas e decisões aprovadas.
10. Preservar o histórico de decisões arquiteturais.

## 10. Documentação para agentes de IA

O arquivo AGENTS.md na raiz conterá as instruções gerais para agentes de IA.

Os arquivos README.md documentarão as responsabilidades locais.

Os agentes deverão respeitar:

- Os limites dos Bounded Contexts.
- A direção das dependências.
- As decisões arquiteturais aprovadas.
- Os contratos públicos.
- Os padrões de qualidade.
- A proibição de inventar decisões ainda pendentes.

## 11. Evolução

A documentação deve evoluir junto com o sistema.

Novos módulos, aplicações ou padrões deverão possuir documentação adequada.

Alterações arquiteturais relevantes deverão ser registradas em ADRs.
