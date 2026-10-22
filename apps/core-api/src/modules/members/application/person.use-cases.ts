import { err, ok, type Result } from '../../../shared/domain/result.js';
import { EmailAddress } from '../../../shared/domain/value-objects/contact.js';
import {
  invalidFields,
  invalidImage,
  notFound,
  storageDisabled,
  uploadMissing,
  uploadTooLarge,
  versionConflict,
  type MembersError,
} from './members-errors.js';
import { buildPersonDetails, type PersonDetailsInput } from './profile-input.js';
import type { PersonSnapshot } from '../domain/person.js';
import type {
  AvatarProcessor,
  AvatarStorage,
  Clock,
  IdGenerator,
  PersonRepository,
  PersonView,
} from './ports.js';

// Fotos de perfil: JPEG, PNG ou WebP de até 10 MB, guardadas como WebP quadrado.
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

const UPLOAD_URL_TTL_SECONDS = 10 * 60;

// Validade da URL de leitura da foto devolvida com o cadastro.
const AVATAR_URL_TTL_SECONDS = 60 * 60;

// Chaves no bucket de mídia, relativas à pasta do ambiente e sempre derivadas de IDs da aplicação.
// O envio bruto fica em members/uploads/ (apagado após o processamento e pela regra de ciclo de vida).
const avatarUploadKey = (personId: string, uploadId: string): string =>
  `members/uploads/avatars/${personId}/${uploadId}`;

const avatarKey = (personId: string, key: string): string =>
  `members/private/people/${personId}/avatar/${key}.webp`;

export interface UpdatePersonCommand extends PersonDetailsInput {
  id: string;
  version: number;
}

export interface ChangePersonEmailCommand {
  id: string;
  email: string;
}

export interface RequestAvatarUploadCommand {
  id: string;
  contentType: AvatarContentType;
}

export interface AvatarUploadTicket {
  uploadId: string;
  uploadUrl: string;
  // O navegador envia com este Content-Type (assinado na URL).
  contentType: AvatarContentType;
  expiresAt: string;
}

export interface CompleteAvatarUploadCommand {
  id: string;
  uploadId: string;
}

type PersonResult = Result<PersonView, MembersError>;

// Monta a visão do cadastro, trocando a chave da foto por uma URL de leitura de validade curta.
export class PersonViews {
  constructor(private readonly storage: AvatarStorage) {}

  async of(snapshot: PersonSnapshot): Promise<PersonView> {
    const key = snapshot.avatarKey;

    const avatarUrl =
      key && this.storage.enabled
        ? await this.storage.presignDownload(avatarKey(snapshot.id, key), AVATAR_URL_TTL_SECONDS)
        : null;

    // A conta de origem e a chave interna da foto não saem da Core API.
    return {
      id: snapshot.id,
      fullName: snapshot.fullName,
      sex: snapshot.sex,
      birthDate: snapshot.birthDate,
      phone: snapshot.phone,
      secondaryPhone: snapshot.secondaryPhone,
      email: snapshot.email,
      secondaryEmail: snapshot.secondaryEmail,
      address: snapshot.address,
      socialLinks: snapshot.socialLinks,
      avatarUrl,
      version: snapshot.version,
    };
  }
}

export class GetPersonUseCase {
  constructor(
    private readonly people: PersonRepository,
    private readonly views: PersonViews,
  ) {}

  async execute(id: string): Promise<PersonResult> {
    const person = await this.people.findById(id);

    return person ? ok(await this.views.of(person.toSnapshot())) : err(notFound);
  }
}

// Grava o cadastro do Perfil (substituição completa, exceto e-mail principal e foto).
export class UpdatePersonUseCase {
  constructor(
    private readonly people: PersonRepository,
    private readonly views: PersonViews,
    private readonly clock: Clock,
  ) {}

  async execute({ id, version, ...input }: UpdatePersonCommand): Promise<PersonResult> {
    const person = await this.people.findById(id);

    if (!person) {
      return err(notFound);
    }

    if (person.version !== version) {
      return err(versionConflict);
    }

    const details = buildPersonDetails(input, this.clock.today());

    if (!details.ok) {
      return err(invalidFields(details.error));
    }

    person.updateDetails(details.value);

    const updated = await this.people.update(person);

    return updated === null
      ? err(versionConflict)
      : ok(await this.views.of({ ...person.toSnapshot(), version: updated }));
  }
}

// Acompanha a troca do e-mail de acesso, chamada pelo BFF depois da confirmação no novo endereço.
export class ChangePersonEmailUseCase {
  constructor(
    private readonly people: PersonRepository,
    private readonly views: PersonViews,
  ) {}

  async execute({ email, id }: ChangePersonEmailCommand): Promise<PersonResult> {
    const address = EmailAddress.create(email);

    if (!address.ok) {
      return err(invalidFields(['email']));
    }

    const person = await this.people.findById(id);

    if (!person) {
      return err(notFound);
    }

    person.changeEmail(address.value);

    const version = await this.people.update(person);

    return version === null
      ? err(versionConflict)
      : ok(await this.views.of({ ...person.toSnapshot(), version }));
  }
}

export class RequestAvatarUploadUseCase {
  constructor(
    private readonly people: PersonRepository,
    private readonly storage: AvatarStorage,
    private readonly ids: IdGenerator,
  ) {}

  async execute({
    contentType,
    id,
  }: RequestAvatarUploadCommand): Promise<Result<AvatarUploadTicket, MembersError>> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    if (!(await this.people.findById(id))) {
      return err(notFound);
    }

    const uploadId = this.ids.next();

    const uploadUrl = await this.storage.presignUpload(
      avatarUploadKey(id, uploadId),
      contentType,
      UPLOAD_URL_TTL_SECONDS,
    );

    return ok({
      uploadId,
      uploadUrl,
      contentType,
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    });
  }
}

// Confirma o envio: valida o conteúdo real, grava a foto quadrada em WebP (sem metadados) e apaga o
// envio bruto e a foto anterior. Processada na própria requisição: é uma imagem só e pequena.
export class CompleteAvatarUploadUseCase {
  constructor(
    private readonly people: PersonRepository,
    private readonly storage: AvatarStorage,
    private readonly processor: AvatarProcessor,
    private readonly views: PersonViews,
    private readonly ids: IdGenerator,
  ) {}

  async execute({ id, uploadId }: CompleteAvatarUploadCommand): Promise<PersonResult> {
    if (!this.storage.enabled) {
      return err(storageDisabled);
    }

    const person = await this.people.findById(id);

    if (!person) {
      return err(notFound);
    }

    const uploadKey = avatarUploadKey(id, uploadId);

    const size = await this.storage.size(uploadKey);

    if (size === null) {
      return err(uploadMissing);
    }

    // A URL pré-assinada não limita o tamanho: o excesso é descartado aqui.
    if (size > MAX_AVATAR_BYTES) {
      await this.storage.delete([uploadKey]);

      return err(uploadTooLarge);
    }

    const upload = await this.storage.read(uploadKey);

    const avatar = upload ? await this.processor.process(upload) : null;

    if (!avatar) {
      await this.storage.delete([uploadKey]);

      return upload ? err(invalidImage) : err(uploadMissing);
    }

    const key = this.ids.next();

    await this.storage.write(avatarKey(id, key), avatar, 'image/webp');

    const previous = person.replaceAvatar(key);

    const version = await this.people.update(person);

    if (version === null) {
      await this.storage.delete([avatarKey(id, key), uploadKey]);

      return err(versionConflict);
    }

    await this.storage.delete([uploadKey, ...(previous ? [avatarKey(id, previous)] : [])]);

    return ok(await this.views.of({ ...person.toSnapshot(), version }));
  }
}

export class RemoveAvatarUseCase {
  constructor(
    private readonly people: PersonRepository,
    private readonly storage: AvatarStorage,
    private readonly views: PersonViews,
  ) {}

  async execute(id: string): Promise<PersonResult> {
    const person = await this.people.findById(id);

    if (!person) {
      return err(notFound);
    }

    const previous = person.removeAvatar();

    if (!previous) {
      return ok(await this.views.of(person.toSnapshot()));
    }

    const version = await this.people.update(person);

    if (version === null) {
      return err(versionConflict);
    }

    if (this.storage.enabled) {
      await this.storage.delete([avatarKey(id, previous)]);
    }

    return ok(await this.views.of({ ...person.toSnapshot(), version }));
  }
}
