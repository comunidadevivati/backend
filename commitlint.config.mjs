const emojis = {
  build: '📦',
  chore: '🔧',
  ci: '👷',
  docs: '📝',
  feat: '✨',
  fix: '🐛',
  perf: '⚡',
  refactor: '♻️',
  revert: '⏪',
  style: '🎨',
  test: '🧪',
};

const sections = ['Contexto:', 'Alterações:', 'Impacto:'];

export default {
  extends: ['@commitlint/config-conventional'],

  plugins: [
    {
      rules: {
        'header-emoji': ({ type, subject }) => {
          if (!type || !subject) {
            return [false, 'O commit precisa de tipo e assunto.'];
          }

          const emoji = emojis[type];

          return [
            Boolean(emoji && subject.startsWith(`${emoji} `)),
            `O tipo "${type}" exige o emoji "${emoji ?? 'válido'}" no início do assunto.`,
          ];
        },

        'body-sections': ({ body }) => {
          if (!body) {
            return [false, 'O corpo do commit é obrigatório.'];
          }

          const positions = sections.map((section) => body.indexOf(section));

          const ordered = positions.every(
            (position, index) => position >= 0 && (index === 0 || position > positions[index - 1]),
          );

          if (!ordered) {
            return [false, 'O corpo deve conter, nesta ordem: Contexto:, Alterações: e Impacto:.'];
          }

          const populated = sections.every((section, index) => {
            const start = positions[index] + section.length;

            const end = positions[index + 1] ?? body.length;

            return body.slice(start, end).trim().length > 0;
          });

          return [populated, 'Todas as seções do corpo precisam ter conteúdo.'];
        },
      },
    },
  ],

  rules: {
    'type-enum': [2, 'always', Object.keys(emojis)],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'header-emoji': [2, 'always'],
    'body-empty': [2, 'never'],
    'body-sections': [2, 'always'],
  },
};
