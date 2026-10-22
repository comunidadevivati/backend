import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { parseOrThrow } from '../../../shared/presentation/request-parsing.js';
import { ServiceTokenGuard } from '../../../shared/presentation/service-token.guard.js';
import {
  ChangePersonEmailUseCase,
  CompleteAvatarUploadUseCase,
  GetPersonUseCase,
  RemoveAvatarUseCase,
  RequestAvatarUploadUseCase,
  UpdatePersonUseCase,
  type AvatarUploadTicket,
} from '../application/person.use-cases.js';
import { parseId, throwInvalidFields, unwrap } from './members-problem.js';
import {
  changePersonEmailSchema,
  completeAvatarUploadSchema,
  requestAvatarUploadSchema,
  updatePersonSchema,
} from './members-request.schemas.js';
import type { PersonView } from '../application/ports.js';

// Cadastro da Pessoa (Perfil). Chamado somente pelo BFF, que garante que a Pessoa é a da sessão.
@Controller('people')
@UseGuards(ServiceTokenGuard)
export class PeopleController {
  constructor(
    @Inject(GetPersonUseCase)
    private readonly getPerson: GetPersonUseCase,
    @Inject(UpdatePersonUseCase)
    private readonly updatePerson: UpdatePersonUseCase,
    @Inject(ChangePersonEmailUseCase)
    private readonly changeEmail: ChangePersonEmailUseCase,
    @Inject(RequestAvatarUploadUseCase)
    private readonly requestAvatarUpload: RequestAvatarUploadUseCase,
    @Inject(CompleteAvatarUploadUseCase)
    private readonly completeAvatarUpload: CompleteAvatarUploadUseCase,
    @Inject(RemoveAvatarUseCase)
    private readonly removeAvatar: RemoveAvatarUseCase,
  ) {}

  @Get(':id')
  async get(@Param('id') id: string): Promise<PersonView> {
    return unwrap(await this.getPerson.execute(parseId(id)));
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<PersonView> {
    const personId = parseId(id);

    const input = parseOrThrow(updatePersonSchema, body, throwInvalidFields);

    return unwrap(await this.updatePerson.execute({ id: personId, ...input }));
  }

  @Put(':id/email')
  async email(@Param('id') id: string, @Body() body: unknown): Promise<PersonView> {
    const personId = parseId(id);

    const { email } = parseOrThrow(changePersonEmailSchema, body, throwInvalidFields);

    return unwrap(await this.changeEmail.execute({ id: personId, email }));
  }

  // URL para o navegador enviar a foto direto ao bucket; depois, PUT :id/avatar confirma o envio.
  @Post(':id/avatar/uploads')
  async avatarUpload(@Param('id') id: string, @Body() body: unknown): Promise<AvatarUploadTicket> {
    const personId = parseId(id);

    const { contentType } = parseOrThrow(requestAvatarUploadSchema, body, throwInvalidFields);

    return unwrap(await this.requestAvatarUpload.execute({ id: personId, contentType }));
  }

  @Put(':id/avatar')
  async avatar(@Param('id') id: string, @Body() body: unknown): Promise<PersonView> {
    const personId = parseId(id);

    const { uploadId } = parseOrThrow(completeAvatarUploadSchema, body, throwInvalidFields);

    return unwrap(await this.completeAvatarUpload.execute({ id: personId, uploadId }));
  }

  @Delete(':id/avatar')
  @HttpCode(200)
  async deleteAvatar(@Param('id') id: string): Promise<PersonView> {
    return unwrap(await this.removeAvatar.execute(parseId(id)));
  }
}
