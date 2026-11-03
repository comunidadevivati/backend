# Domínios Communication e Forms

Implementação: `apps/core-api/src/modules/communication` e `apps/core-api/src/modules/forms`.
Decisões: [ADR 0013](../adr/0013-formularios-e-grupos-de-emails.md).

## Linguagem ubíqua

| Termo               | Significado                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| Grupo de e-mails    | Lista nomeada de destinatários (contas e/ou e-mails avulsos) de comunicações.    |
| Tipo do grupo       | Restrito (só contas), aberto (só e-mails avulsos) ou misto (os dois).            |
| Conta elegível      | Conta ativa com e-mail verificado (BFF, `GET /api/v1/email-recipients`).         |
| E-mail avulso       | Endereço informado à mão, de quem não tem conta; não passa por verificação.      |
| Formulário          | Pesquisa ou avaliação de um departamento, com período de validade e perguntas.   |
| Pergunta            | Item do formulário: texto curto, texto longo, múltipla escolha ou escolha única. |
| Opção               | Alternativa de uma pergunta de escolha (1 a 20, rótulos distintos).              |
| Destinatários       | Grupos de e-mails que recebem o formulário.                                      |
| Imagem do cabeçalho | Imagem opcional exibida acima do título, guardada como WebP sem metadados.       |

## Aggregates

### EmailGroup (Communication)

- Campos: nome (único, sem diferenciar maiúsculas), descrição, tipo (`RESTRICTED`, `OPEN`,
  `MIXED`), IDs das contas, e-mails avulsos e versão.
- Das contas do BFF guarda só os IDs, nunca o e-mail; os avulsos ficam em minúsculas.
- O tipo restringe as listas: restrito sem e-mails avulsos, aberto sem contas.
- Contrato público: `EmailGroupDirectory.existingIds(ids)` e `recipients(groupIds)`.

### Form (Forms)

- Campos: departamento (catálogo em código), título, descrição, início e fim, status, perguntas
  (com opções), grupos completos, contas e e-mails escolhidos um a um, imagem do cabeçalho e
  versão.
- Status: `DRAFT` (não publicado), `PUBLISHED`, `FINISHED`, `CANCELLED`; os dois últimos são finais.

## Invariantes

- Publicar exige data de fim que ainda não passou; destinatários são opcionais (uso só impresso).
- Enviar os e-mails exige grupos ou e-mails informados; a lista final não repete endereços.
- Finalizado ou cancelado não muda mais (nem conteúdo, nem status, nem imagem).
- Cancelar exige motivo de 10 a 255 caracteres, gravado no formulário.
- Só aceita respostas (pelo link ou em papel, inclusive anexos e desfazer) publicado e dentro do
  período. Fora disso, o link mostra apenas título, imagem e status, sem perguntas nem ações.
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
