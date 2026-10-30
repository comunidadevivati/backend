// Chaves no bucket de mídia, relativas à pasta do ambiente e sempre derivadas de IDs da aplicação.
// O envio bruto fica em forms/uploads/ (apagado após o processamento e pela regra de ciclo de vida).
export const headerImageKeys = {
  upload: (formId: string, uploadId: string): string =>
    `forms/uploads/header-images/${formId}/${uploadId}`,
  image: (formId: string, key: string): string =>
    `forms/private/forms/${formId}/header-image/${key}.webp`,
};
