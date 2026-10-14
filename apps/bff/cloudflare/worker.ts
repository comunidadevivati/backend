import { Container, getContainer } from '@cloudflare/containers';

interface BffEnvironment {
  BFF_BASE_URL: string;
  BFF_CONTAINER: DurableObjectNamespace<BffContainer>;
  BFF_OIDC_CALLBACK_URL: string;
  COOKIE_SECRET: string;
  KEYCLOAK_CLIENT_ID: string;
  KEYCLOAK_CLIENT_SECRET: string;
  KEYCLOAK_ISSUER: string;
  REDIS_URL: string;
  SESSION_ENCRYPTION_KEY: string;
  WEB_BASE_URL: string;
}

type ContainerContext = ConstructorParameters<typeof Container<BffEnvironment>>[0];

export class BffContainer extends Container<BffEnvironment> {
  override defaultPort = 3000;

  override enableInternet = true;

  override pingEndpoint = 'localhost/health';

  override requiredPorts = [3000];

  override sleepAfter = '10m';

  constructor(ctx: ContainerContext, env: BffEnvironment) {
    super(ctx, env);

    this.envVars = {
      NODE_ENV: 'production',
      BFF_PORT: String(this.defaultPort),
      BFF_BASE_URL: env.BFF_BASE_URL,
      BFF_OIDC_CALLBACK_URL: env.BFF_OIDC_CALLBACK_URL,
      WEB_BASE_URL: env.WEB_BASE_URL,
      KEYCLOAK_ISSUER: env.KEYCLOAK_ISSUER,
      KEYCLOAK_CLIENT_ID: env.KEYCLOAK_CLIENT_ID,
      KEYCLOAK_CLIENT_SECRET: env.KEYCLOAK_CLIENT_SECRET,
      COOKIE_SECRET: env.COOKIE_SECRET,
      SESSION_ENCRYPTION_KEY: env.SESSION_ENCRYPTION_KEY,
      REDIS_URL: env.REDIS_URL,
    };
  }
}

const worker = {
  fetch(request: Request, env: BffEnvironment): Promise<Response> {
    return getContainer(env.BFF_CONTAINER, 'primary').fetch(request);
  },
} satisfies ExportedHandler<BffEnvironment>;

export default worker;
