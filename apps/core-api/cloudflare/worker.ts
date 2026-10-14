import { Container, getContainer } from '@cloudflare/containers';

interface CoreApiEnvironment {
  CORE_API_CONTAINER: DurableObjectNamespace<CoreApiContainer>;
}

export class CoreApiContainer extends Container<CoreApiEnvironment> {
  override defaultPort = 3001;

  override enableInternet = true;

  override pingEndpoint = 'localhost/api/v1/health';

  override requiredPorts = [3001];

  override sleepAfter = '10m';

  override envVars = {
    NODE_ENV: 'production',
    PORT: String(this.defaultPort),
  };
}

const worker = {
  fetch(request: Request, env: CoreApiEnvironment): Promise<Response> {
    return getContainer(env.CORE_API_CONTAINER, 'primary').fetch(request);
  },
} satisfies ExportedHandler<CoreApiEnvironment>;

export default worker;
