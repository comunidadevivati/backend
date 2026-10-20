# Domínio Gallery

Implementação: `apps/core-api/src/modules/gallery`. Decisões:
[ADR 0010](../adr/0010-galeria-de-fotos-r2.md).

## Linguagem ubíqua

| Termo             | Significado                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| Álbum             | Conjunto de fotos de um culto ou evento, com título, data e descrição.      |
| Foto              | Imagem enviada a um álbum; privada até ser publicada.                       |
| Envio             | Transferência direta do navegador ao bucket de mídia, por URL pré-assinada. |
| Original reduzido | Cópia privada da foto com lado maior até 4096 px, sem metadados.            |
| Variante          | Versão otimizada da foto (AVIF e WebP, de 320 a 2048 px) para srcset.       |
| Placeholder       | Imagem minúscula em base64, exibida borrada enquanto a variante carrega.    |
| Publicação        | Cópia das variantes para a área pública, servida pela CDN (próxima etapa).  |

## Aggregates

### Album

- Campos: slug (único e estável), título, descrição, data do evento, capa, situação, momento da
  publicação e versão.
- Situações: nasce `DRAFT`; `PUBLISHED` e `ARCHIVED` chegam com a etapa de publicação. Arquivado é
  somente leitura e não recebe fotos.
- O slug é derivado da data e do título (`2026-10-19-culto-de-domingo`, com sufixo `-2`, `-3`... se
  repetido) e não muda quando o título muda.

### Photo

- Campos: álbum, situação, tipo e tamanho declarados, largura, altura, placeholder, larguras das
  variantes, motivo da falha e versão.
- Situações: `PENDING_UPLOAD` → `PROCESSING` → `READY` ou `FAILED` (`invalid_image` ou
  `processing_error`).

## Invariantes

- Somente JPEG, PNG ou WebP, até 25 MB por arquivo, até 50 por pedido e 500 por álbum.
- O conteúdo real é validado no processamento, independentemente do tipo declarado.
- Variantes e original reduzido não carregam metadados (EXIF, GPS, XMP); a rotação do EXIF é
  aplicada antes.
- Chaves de objeto derivadas dos IDs (nunca do nome do arquivo); a foto não publicada só existe no
  área privada do bucket (fora de `gallery/public/`).
- Pedidos de envio não confirmados em 24 h são descartados.

## Use Cases

| Use Case         | Rota da Core API (`/api/v1`)                                  |
| ---------------- | ------------------------------------------------------------- |
| ListAlbums       | `GET /gallery/albums?status&cursor&limit`                     |
| GetAlbum         | `GET /gallery/albums/:id`                                     |
| CreateAlbum      | `POST /gallery/albums` (`{ title, occurredOn, description }`) |
| UpdateAlbum      | `PATCH /gallery/albums/:id` (exige `version`)                 |
| ListPhotos       | `GET /gallery/albums/:id/photos?cursor&limit` (com miniatura) |
| RequestUploads   | `POST /gallery/albums/:id/uploads` (`{ files }`)              |
| CompleteUpload   | `POST /gallery/photos/:id/complete` (202, processamento)      |
| DeletePhoto      | `DELETE /gallery/photos/:id` (exclusão definitiva)            |
| ProcessPhoto     | Fila em processo, uma foto por vez                            |
| ResumeProcessing | Ao iniciar a Core API, retoma as fotos `PROCESSING`           |

Álbuns são listados dos mais recentes para os mais antigos (data do evento e criação). As
miniaturas do painel são URLs de leitura pré-assinadas, válidas por 1 hora.

## Autorização

Provisória no MVP, como nos demais contextos: o BFF exige sessão com e-mail verificado e CSRF nas
alterações. Quem envia ou publica ainda não é registrado (propagação de identidade pendente).
