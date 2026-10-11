import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  allowInsecureRequests,
  ClientSecretPost,
  type Configuration,
  discovery,
} from 'openid-client';

@Injectable()
export class OidcClientService implements OnModuleInit {
  private configuration!: Configuration;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const issuer = this.configService.getOrThrow<string>('KEYCLOAK_ISSUER');

    const clientId = this.configService.getOrThrow<string>('KEYCLOAK_CLIENT_ID');

    const clientSecret = this.configService.getOrThrow<string>('KEYCLOAK_CLIENT_SECRET');

    const nodeEnv = this.configService.getOrThrow<string>('NODE_ENV');

    const issuerUrl = new URL(issuer);

    const allowLocalHttp =
      nodeEnv === 'development' &&
      issuerUrl.hostname === 'localhost' &&
      issuerUrl.protocol === 'http:';

    this.configuration = await discovery(
      issuerUrl,
      clientId,
      undefined,
      ClientSecretPost(clientSecret),
      {
        execute: allowLocalHttp ? [allowInsecureRequests] : [],
      },
    );
  }

  getConfiguration(): Configuration {
    return this.configuration;
  }
}
