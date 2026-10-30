# Domínios Communication e Forms

Implementação: `apps/core-api/src/modules/communication` e `apps/core-api/src/modules/forms`.
Decisões: [ADR 0013](../adr/0013-formularios-e-grupos-de-emails.md).

## Linguagem ubíqua

| Termo               | Significado                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| Grupo de e-mails    | Lista nomeada de contas verificadas (membros ou não) que recebem comunicações.   |
| Conta elegível      | Conta ativa com e-mail verificado (BFF, `GET /api/v1/email-recipients`).         |
| Formulário          | Pesquisa ou avaliação de um departamento, com período de validade e perguntas.   |
| Pergunta            | Item do formulário: texto curto, texto longo, múltipla escolha ou escolha única. |
| Opção               | Alternativa de uma pergunta de escolha (1 a 20, rótulos distintos).              |
| Destinatários       | Grupos de e-mails que recebem o formulário.                                      |
| Imagem do cabeçalho | Imagem opcional exibida acima do título, guardada como WebP sem metadados.       |

## Aggregates

### EmailGroup (Communication)

- Campos: nome (único, sem diferenciar maiúsculas), descrição, IDs das contas e versão.
- Guarda IDs de contas do BFF, nunca e-mails.
- Contrato público: `EmailGroupDirectory.existingIds(ids)`.

### Form (Forms)

- Campos: departamento (catálogo em código), título, descrição, início e fim, status, perguntas
  (com opções), grupos destinatários, imagem do cabeçalho e versão.
- Status: `DRAFT` (não publicado), `PUBLISHED`, `FINISHED`, `CANCELLED`; os dois últimos são finais.

## Invariantes

- Publicar exige ao menos um grupo e data de fim que ainda não passou.
- Finalizado ou cancelado não muda mais (nem conteúdo, nem status, nem imagem).
- Publicado não pode ser excluído.
- Grupos destinatários precisam existir em Communication ao salvar.
- IDs de perguntas e opções são mantidos entre edições.

## Use Cases

- Communication: listar, ler, criar, editar (substituição completa) e excluir grupos.
- Forms: listar (por status, cursor), resumo por status, ler, criar, editar, mudar status, excluir,
  pedir URL de envio da imagem, confirmar o envio e remover a imagem.

## Convites e respostas

- FormInvitation (Forms): um por conta e formulário, criado no envio dos e-mails; guarda o hash do
  token do link, nome e e-mail do envio e a resposta: digital (pelo link) ou em papel (marcada no
  painel, com anexo opcional).
- Invariantes: uma resposta por convite; resposta digital só com o formulário publicado e dentro do
  período; resposta em papel não substitui uma digital e pode ser desfeita.

## Pendências

Histórico de quem fez cada ação, lembretes e encerramento automáticos e retenção automática (ver
ADR 0013).
