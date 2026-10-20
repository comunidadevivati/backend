# ADR 0010 — Galeria de fotos com Cloudflare R2 e publicação controlada

- Status: Proposed (implementação em etapas; aguarda aprovação)
- Data: 2026-10-20

## Contexto

A direção do projeto pediu uma galeria de fotos: administradores criam álbuns (por culto ou
evento), enviam fotografias e escolhem quais aparecem na seção **Fotos** do site público. Um
álbum pode ter centenas de fotos, e o site precisa continuar leve. O ADR 0002 já aprovou o
Cloudflare R2 para armazenamento de objetos. Restrições do MVP: Render Free (CPU muito limitada,
hibernação), sem worker contínuo aprovado e cota gratuita do R2 de 10 GB.

## Decisão

### Contexto e responsabilidades

- **Gallery** é um novo Bounded Context na Core API (`modules/gallery`, schema `gallery`). As
  credenciais do R2 e do Cloudflare ficam somente na Core API.
- O **BFF** expõe as rotas administrativas (sessão com e-mail verificado e `X-CSRF-Token`, como os
  ADRs 0006 a 0009) e, na etapa de publicação, rotas públicas somente de leitura para álbuns e
  fotos publicados, com cache HTTP.
- A API nunca serve os bytes das imagens: o navegador envia direto ao R2 por URL pré-assinada e o
  site público baixa as imagens da CDN.

### Armazenamento

- **Um único bucket** (`comunidade-viva-media`), compartilhado por HML e produção: a cota
  gratuita de 10 GB do R2 é da conta, e vários buckets só dividiriam o mesmo limite. Cada ambiente
  grava na sua pasta (`MEDIA_KEY_PREFIX`: `prod`, `hml`; `dev` e `test` no emulador local), e
  todas as chaves abaixo são relativas a ela.
- **Área privada** (nunca servida pelo domínio público):
  - `gallery/uploads/{photoId}`: envio bruto, apagado após o processamento (e por regra de ciclo de
    vida de 1 dia, para envios abandonados);
  - `gallery/private/albums/{albumId}/originals/{photoId}.jpg`: **original reduzido** (lado maior
    até 4096 px, JPEG qualidade 90), para respeitar a cota de 10 GB;
  - `gallery/private/albums/{albumId}/photos/{photoId}/{largura}.{avif|webp}`: variantes privadas,
    usadas nas miniaturas do painel (URL de leitura pré-assinada, validade curta).
- **Área pública** (etapa B),
  `gallery/public/albums/{albumId}/photos/{photoId}/{publicação}/{largura}.{formato}`: somente
  variantes de fotos publicadas, servidas por `media.comvivaeficaz.com.br` (pasta `prod`) e
  `media-hml.comvivaeficaz.com.br` (pasta `hml`), domínios personalizados do mesmo bucket. A
  chave de publicação muda a cada publicação, permitindo `Cache-Control: public, max-age=31536000,
  immutable` sem servir versão antiga.
- Como o domínio personalizado do R2 expõe o bucket inteiro, uma **regra do WAF** na zona bloqueia,
  em cada domínio, toda requisição fora de `/{pasta do ambiente}/gallery/public/`, e o acesso
  `r2.dev` fica desligado. Sem essa regra, o domínio público não deve ser ligado.
- Chaves sempre geradas pela aplicação (UUIDv7); o nome do arquivo enviado nunca é usado.
- CORS do bucket liberando `PUT` e `GET` somente para as origens da aplicação web.

### Envio e processamento

- O painel pede URLs de envio (até 50 arquivos por pedido; JPEG, PNG ou WebP; até 25 MB cada; até
  500 fotos por álbum). A foto nasce `PENDING_UPLOAD`.
- Após o `PUT`, o painel confirma o envio. A Core API confere existência e tamanho do objeto e marca
  a foto `PROCESSING`; o processamento é **assíncrono**, numa fila em processo com uma foto por vez
  (o Render Free tem pouca CPU). Fotos `PROCESSING` são retomadas ao reiniciar a Core API.
- O processamento (`sharp`) valida o conteúdo real (não a extensão), aplica a rotação do EXIF,
  **remove todos os metadados** (inclusive GPS), grava o original reduzido e as variantes de
  320, 640, 1024, 1600 e 2048 px (somente até a largura real) em AVIF e WebP, e guarda no banco
  largura, altura e um placeholder minúsculo em base64. Resultado: `READY` ou `FAILED`.
- A URL de envio assina o `Content-Type` (o bucket recusa outro tipo), mas não limita o tamanho
  nem garante o conteúdo real: a validação definitiva é sempre a do servidor, depois do envio.

### Publicação (etapa B)

- Publicar uma foto copia as variantes da área privada para a pública com a nova chave de
  publicação; despublicar apaga os objetos públicos **e purga as URLs na CDN** pela API do
  Cloudflare (token com permissão de purge na zona), mantendo o original privado.
- Exclusão definitiva apaga objetos públicos (com purge) e privados, e depois os metadados.
- Álbum: `DRAFT`, `PUBLISHED`, `ARCHIVED`. Só aparece no site se estiver `PUBLISHED` e tiver ao
  menos uma foto publicada; a capa precisa ser uma foto publicada.

### Ambientes

- Desenvolvimento e testes usam um emulador S3 local (`versitygw`) em contêiner, sem consumir a
  cota nem exigir credenciais do R2. Homologação e produção usam o R2.
- `MEDIA_STORAGE=disabled` desliga a galeria (rotas respondem indisponível); `s3` exige endpoint,
  região, credenciais, bucket e pasta do ambiente, validados ao iniciar.

## Justificativa

A separação entre a área privada e a pública (prefixos distintos, com o domínio público restrito à
pública pela regra do WAF) garante que foto não publicada nunca tenha URL pública, sem dividir a
cota entre vários buckets.
Processar uma vez no envio mantém a publicação rápida e entrega ao site imagens já otimizadas,
sem depender da cota de transformações do Cloudflare. A fila em processo evita estourar o tempo de
resposta no Render Free sem antecipar a escolha da fila de mensagens (pendente desde o ADR 0003).

## Consequências

- O processamento compete por CPU com as requisições da Core API; envios grandes ficam lentos no
  plano gratuito (estimativa: 15 a 20 s por foto). A fila em processo se perde se a instância
  hibernar no meio, mas as fotos são retomadas ao reiniciar.
- A cota de 10 GB comporta da ordem de 3.000 a 5.000 fotos (original reduzido + variantes).
- O vínculo de quem enviou ou publicou não é registrado ainda: a propagação da identidade do BFF
  para a Core API continua pendente. Qualquer conta verificada administra a galeria até o contexto
  Authorization existir.
- Fotos de pessoas, inclusive crianças, exigem uma política de uso de imagem no site público.
- HML e produção usam o mesmo bucket e, como o token do R2 não se restringe a um prefixo, a
  credencial de um ambiente consegue gravar na pasta do outro. Aceito no MVP; a proteção depende de
  guardar os tokens como secrets e de cada Core API usar só a sua pasta.
- HEIC não é aceito no MVP (o `sharp` pré-compilado não o decodifica); navegadores costumam
  converter para JPEG no envio.
- Novas dependências na Core API: `aws4fetch` (assinatura S3, sem dependências) e `sharp`; nos
  testes, `testcontainers` para subir o emulador S3.

## Alternativas consideradas

- Gerar a versão web somente ao publicar: descartada, pois publicar centenas de fotos de uma vez
  estouraria o tempo de resposta e o painel não teria miniaturas.
- Cloudflare Image Resizing sobre o original: descartada no MVP pela cota mensal de
  transformações do plano gratuito.
- Bucket com flag de publicação no banco, sem separar os prefixos: descartada, pois a foto não
  publicada continuaria acessível pela URL.
- Buckets separados (privado e público, por ambiente): proposta inicial, trocada pelo bucket único
  porque a cota de 10 GB é da conta e a separação por bucket só complicava o controle dela.
- AWS SDK v3: funcional, porém muito maior; `aws4fetch` cobre assinatura e URLs pré-assinadas.
- MinIO como emulador local: as imagens da comunidade deixaram de ser distribuídas.
