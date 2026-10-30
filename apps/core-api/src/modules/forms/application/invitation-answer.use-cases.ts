import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  buildAnswers,
  type AnswerInput,
  type FormAnswer,
  type FormInvitation,
} from '../domain/form-invitation.js';
import { invalidFields, type FormsError } from './forms-errors.js';
import type { Form, FormQuestion } from '../domain/form.js';
import type { FormHeaderImageView, FormViews } from './form-views.js';
import type {
  Clock,
  FormInvitationRepository,
  FormRepository,
  IdGenerator,
  InvitationTokens,
} from './ports.js';

// Resposta pelo link do e-mail (ADR 0013): o token é a credencial, sem sessão. Somente o necessário
// para responder sai daqui (nada de versão, grupos ou dados de controle).

// OPEN: aceita resposta. NOT_STARTED/ENDED: fora do período. CLOSED: não publicado, finalizado ou
// cancelado.
export type InvitationAvailability = 'OPEN' | 'NOT_STARTED' | 'ENDED' | 'CLOSED';

export interface InvitationView {
  recipient: { name: string; email: string };
  status: 'PENDING' | 'ANSWERED';
  // PAPER: a resposta foi registrada no painel a partir da versão impressa.
  answerChannel: 'DIGITAL' | 'PAPER' | null;
  answeredAt: string | null;
  answers: FormAnswer[];
  availability: InvitationAvailability;
  form: {
    title: string;
    description: string | null;
    startsOn: string;
    endsOn: string;
    headerImage: FormHeaderImageView | null;
    questions: FormQuestion[];
    // Anônimo: as respostas não ficam ligadas à pessoa (e não são exibidas de volta).
    anonymous: boolean;
    // Quem respondeu pelo link pode alterar a resposta até o fim do período.
    allowAnswerEdit: boolean;
    consentText: string | null;
  };
}

export interface SubmitAnswersInput {
  answers: readonly AnswerInput[];
  consentAccepted: boolean;
}

const availabilityOf = (form: Form, today: string): InvitationAvailability => {
  const { endsOn, startsOn, status } = form.toSnapshot();

  if (status !== 'PUBLISHED') {
    return 'CLOSED';
  }

  if (today < startsOn) {
    return 'NOT_STARTED';
  }

  return today > endsOn ? 'ENDED' : 'OPEN';
};

type Loaded = Result<{ form: Form; invitation: FormInvitation }, FormsError>;

class InvitationReader {
  constructor(
    private readonly forms: FormRepository,
    private readonly invitations: FormInvitationRepository,
    private readonly tokens: InvitationTokens,
    private readonly views: FormViews,
    private readonly clock: Clock,
  ) {}

  async load(token: string): Promise<Loaded> {
    const invitation = await this.invitations.findByTokenHash(this.tokens.hash(token));

    const form = invitation ? await this.forms.findById(invitation.toSnapshot().formId) : null;

    return invitation && form ? ok({ form, invitation }) : err({ type: 'invitation_not_found' });
  }

  async view(form: Form, invitation: FormInvitation): Promise<InvitationView> {
    const { answerChannel, answeredAt, answers, recipientEmail, recipientName, status } =
      invitation.toSnapshot();

    const {
      allowAnswerEdit,
      anonymous,
      consentText,
      description,
      endsOn,
      headerImage,
      questions,
      startsOn,
      title,
    } = await this.views.of(form.toSnapshot());

    return {
      recipient: { name: recipientName, email: recipientEmail },
      status,
      answerChannel,
      answeredAt,
      answers,
      availability: availabilityOf(form, this.clock.today()),
      form: {
        title,
        description,
        startsOn,
        endsOn,
        headerImage,
        questions,
        anonymous,
        allowAnswerEdit,
        consentText,
      },
    };
  }

  today(): string {
    return this.clock.today();
  }

  now(): string {
    return this.clock.now().toISOString();
  }
}

export class LookupInvitationUseCase {
  private readonly reader: InvitationReader;

  constructor(
    forms: FormRepository,
    invitations: FormInvitationRepository,
    tokens: InvitationTokens,
    views: FormViews,
    clock: Clock,
  ) {
    this.reader = new InvitationReader(forms, invitations, tokens, views, clock);
  }

  async execute(token: string): Promise<Result<InvitationView, FormsError>> {
    const loaded = await this.reader.load(token);

    return loaded.ok
      ? ok(await this.reader.view(loaded.value.form, loaded.value.invitation))
      : loaded;
  }
}

// Uma resposta por convite, somente com o formulário aberto (publicado e dentro do período).
export class SubmitAnswersUseCase {
  private readonly reader: InvitationReader;

  constructor(
    forms: FormRepository,
    private readonly invitations: FormInvitationRepository,
    tokens: InvitationTokens,
    views: FormViews,
    clock: Clock,
    private readonly ids: IdGenerator,
  ) {
    this.reader = new InvitationReader(forms, invitations, tokens, views, clock);
  }

  async execute(
    token: string,
    { answers: input, consentAccepted }: SubmitAnswersInput,
  ): Promise<Result<InvitationView, FormsError>> {
    const loaded = await this.reader.load(token);

    if (!loaded.ok) {
      return loaded;
    }

    const { form, invitation } = loaded.value;

    if (availabilityOf(form, this.reader.today()) !== 'OPEN') {
      return err({ type: 'form_unavailable' });
    }

    const answers = buildAnswers(form.questions, input, {
      required: form.consentText !== null,
      accepted: consentAccepted,
    });

    if (!answers.ok) {
      return err(invalidFields(answers.error));
    }

    const saved = form.isAnonymous
      ? await this.saveAnonymously(form, invitation, answers.value)
      : await this.save(form, invitation, answers.value);

    return saved ? ok(await this.reader.view(form, invitation)) : err({ type: 'already_answered' });
  }

  private async save(form: Form, invitation: FormInvitation, answers: FormAnswer[]) {
    const answered = invitation.answer(answers, this.reader.now(), form.allowsAnswerEdit);

    return answered.ok && (await this.invitations.update(invitation));
  }

  // Anônimo: o convite só fica marcado como respondido; as respostas vão para a tabela sem vínculo.
  private async saveAnonymously(form: Form, invitation: FormInvitation, answers: FormAnswer[]) {
    const answered = invitation.answerAnonymously(this.reader.now());

    return (
      answered.ok &&
      (await this.invitations.updateWithAnonymousResponse(invitation, {
        id: this.ids.next(),
        formId: form.id,
        answers,
        submittedOn: this.reader.today(),
      }))
    );
  }
}
