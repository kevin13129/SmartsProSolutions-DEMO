import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const output = resolve(root, 'dist');
export const publicFiles = JSON.parse(await readFile(new URL('../security/public-files.json', import.meta.url), 'utf8'));
export const deployment = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
export const headers = Object.fromEntries(deployment.headers[0].headers.map(({ key, value }) => [key, value]));

export async function build() {
  // Validate every source before touching the old output. No directory copying,
  // environment interpolation, symlink following, or dependency downloads.
  for (const file of publicFiles) {
    if (!/^(?:index\.html|404\.html|assets\/images\/brand-mark\.svg|assets\/(?:css|js|fonts|images|videos)\/[a-zA-Z0-9-]+\.(?:css|js|woff2|txt|png|jpg|webm))$/.test(file)) {
      throw new Error('Unapproved public path: ' + file);
    }
    const source = resolve(root, file);
    if ((await lstat(source)).isSymbolicLink() || (await realpath(source)).toLowerCase() !== source.toLowerCase()) {
      throw new Error('Symlinks are not allowed in public assets: ' + file);
    }
  }
  // The recursive removal target is fixed and checked to remain inside the repo.
  const target = relative(root, output);
  if (target !== 'dist' || isAbsolute(target)) throw new Error('Unsafe build output');
  const existing = await lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing && (existing.isSymbolicLink() || (await realpath(output)).toLowerCase() !== output.toLowerCase())) {
    throw new Error('Build output must not be a symlink');
  }
  await rm(output, { recursive: true, force: true });
  for (const file of publicFiles) {
    const destination = resolve(output, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(root, file), destination);
  }
  // Netlify/Cloudflare Pages format. Vercel uses vercel.json directly.
  await writeFile(resolve(output, '_headers'), '/*\n' + Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join('\n') + '\n');
  console.log(`Built ${publicFiles.length} approved public files in dist/.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
