import { err, ok, type Result } from '../../../../shared/domain/result.js';

const SOCIAL_NETWORKS = ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube'] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export type SocialLinksProps = Record<SocialNetwork, string | null>;

// Domínios aceitos em cada rede (e seus subdomínios, como www. e m.).
const HOSTS: Record<SocialNetwork, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com'],
  twitter: ['twitter.com', 'x.com'],
  youtube: ['youtube.com', 'youtu.be'],
};

const MAX_LENGTH = 300;

// Link do perfil na rede: HTTPS, do domínio da própria rede e com o caminho do perfil. Sem protocolo,
// assume https:// (ex.: instagram.com/comunidadeviva).
const normalizeLink = (network: SocialNetwork, raw: string): string | null => {
  const value = raw.trim();

  let url: URL;

  try {
    url = new URL(/^https?:\/\//iu.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();

  const allowed = HOSTS[network].some((domain) => host === domain || host.endsWith(`.${domain}`));

  if (!allowed || url.pathname.length <= 1 || url.username || url.password) {
    return null;
  }

  url.protocol = 'https:';

  const link = url.toString();

  return link.length <= MAX_LENGTH ? link : null;
};

// Links das redes sociais da Pessoa; cada rede é opcional.
export class SocialLinks {
  private constructor(private readonly props: SocialLinksProps) {}

  static empty(): SocialLinks {
    return new SocialLinks({
      instagram: null,
      facebook: null,
      linkedin: null,
      twitter: null,
      youtube: null,
    });
  }

  static create(raw: SocialLinksProps): Result<SocialLinks, SocialNetwork[]> {
    const props = SocialLinks.empty().toProps();

    const invalid: SocialNetwork[] = [];

    for (const network of SOCIAL_NETWORKS) {
      const value = raw[network];

      if (value === null || value.trim() === '') {
        continue;
      }

      const link = normalizeLink(network, value);

      if (link === null) {
        invalid.push(network);
      } else {
        props[network] = link;
      }
    }

    return invalid.length > 0 ? err(invalid) : ok(new SocialLinks(props));
  }

  toProps(): SocialLinksProps {
    return { ...this.props };
  }
}
