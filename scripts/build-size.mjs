import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const applications = ['core-api', 'bff', 'worker'];

const getSize = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });

  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return getSize(file);
      }

      if (entry.isFile()) {
        return (await stat(file)).size;
      }

      return 0;
    }),
  );

  return sizes.reduce((total, size) => total + size, 0);
};

const formatSize = (bytes) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(2)} KB`
    : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const results = await Promise.all(
  applications.map(async (application) => {
    const directory = path.join('apps', application, 'dist');

    try {
      const bytes = await getSize(directory);

      return `${application}: ${formatSize(bytes)} (${bytes} bytes)`;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return `${application}: build não encontrado`;
      }

      throw error;
    }
  }),
);

process.stdout.write(`\nBuild Size Report\n\n${results.join('\n')}\n`);
