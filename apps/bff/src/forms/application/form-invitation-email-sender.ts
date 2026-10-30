export interface SendFormInvitationEmail {
  email: string;
  name: string;
  formTitle: string;
  formDescription: string | null;
  startsOn: string;
  endsOn: string;
  // INVITE: convite; REMINDER: lembrete a quem ainda não respondeu.
  kind: 'INVITE' | 'REMINDER';
  // Mensagem opcional de quem enviou, exibida no e-mail.
  message: string | null;
  // Link pessoal de resposta (com o token).
  answerUrl: string;
  // Repetir com a mesma chave não gera um segundo e-mail no provedor.
  idempotencyKey: string;
  // Versão para impressão (PDF), quando gerada.
  printout: { filename: string; content: Uint8Array } | null;
}

export interface SendAnswersCopyEmail {
  email: string;
  name: string;
  formTitle: string;
  // PDF com as respostas enviadas.
  pdf: { filename: string; content: Uint8Array };
  idempotencyKey: string;
}

// Classe abstrata para servir também de token de injeção.
export abstract class FormInvitationEmailSender {
  // false quando EMAIL_PROVIDER=disabled: nenhum e-mail sai e o envio conta como falha.
  abstract readonly enabled: boolean;

  // Devolve o ID da mensagem no provedor (para acompanhar a entrega), quando houver.
  abstract send(email: SendFormInvitationEmail): Promise<{ messageId: string | null }>;

  // Cópia das respostas para quem respondeu pelo link.
  abstract sendAnswersCopy(email: SendAnswersCopyEmail): Promise<void>;
}
