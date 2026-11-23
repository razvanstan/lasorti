#!/usr/bin/env node
/**
 * Builds the site and uploads it over FTP(S) to shared hosting.
 *
 *   npm run deploy               build, upload, then delete remote files that are no longer in dist/
 *   npm run deploy:check         only connect and list the remote folder; changes nothing
 *   npm run deploy:dry           build and show what would be uploaded and deleted; changes nothing
 *   npm run deploy -- --no-build upload what is already in dist/
 *   npm run deploy -- --backup   first download the remote folder to .deploy-backups/<date>/
 *
 * Credentials come from `.env` (see .env.example). The repository is public: never put them anywhere else.
 *
 * The remote folder is never emptied: files are uploaded over the old ones first, and only then the ones that
 * no longer exist locally are deleted, except for PROTECTED (managed by the hosting, not by us).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Client, FTPError } from 'basic-ftp';

/** Entries in the remote root that a deploy never deletes. */
const PROTECTED = new Set(['.well-known', 'cgi-bin', '.user.ini', 'php.ini', 'error_log', '.ftpquota']);
/** Any of these means that the folder is the home of the hosting account, not of the site. */
const HOME_MARKERS = ['public_html', 'mail', 'etc', 'logs', 'ssl', 'tmp', '.cpanel', 'www', 'httpdocs'];
const DIST = path.resolve('dist');
const TIMEOUT_MS = 30_000;

/** An expected problem, shown without a stack trace. */
class DeployError extends Error {}

function readConfig() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env file: the check below explains what is missing
  }
  const { FTP_HOST: host, FTP_USER: user, FTP_PASSWORD: password, FTP_SECURE, FTP_PORT, FTP_ROOT } = process.env;
  const root = FTP_ROOT || '/public_html/';
  if (!host || !user || !password) {
    throw new DeployError('Missing FTP_HOST / FTP_USER / FTP_PASSWORD. Copy .env.example to .env and fill it in.');
  }
  if (!root.startsWith('/')) {
    throw new DeployError(`FTP_ROOT must be an absolute path (e.g. /public_html/), not "${root}".`);
  }
  return { host, user, password, root, secure: FTP_SECURE?.toLowerCase() !== 'false', port: Number(FTP_PORT || 21) };
}

async function connect({ host, user, password, secure, port }) {
  const ftp = new Client(TIMEOUT_MS);
  try {
    await ftp.access({ host, user, password, secure, port });
    return ftp;
  } catch (err) {
    const reason = String(err?.message ?? err);
    const hint = /certificate|altnames|self.signed|SSL|TLS/i.test(reason)
      ? '\n  The FTPS certificate does not match the host. Set FTP_HOST to the server hostname from the hosting panel.'
      : '';
    throw new DeployError(`Cannot connect to ${host}: ${reason}${hint}`);
  }
}

/** Adds a folder and everything in it to a tree of relative paths. */
function addFolder(tree, rel, children) {
  tree.dirs.add(rel);
  children.files.forEach((file) => tree.files.add(file));
  children.dirs.forEach((dir) => tree.dirs.add(dir));
}

const emptyTree = () => ({ files: new Set(), dirs: new Set() });
const joinRel = (base, name) => (base ? `${base}/${name}` : name);

function walkLocal(dir, base = '') {
  const tree = emptyTree();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = joinRel(base, entry.name);
    if (entry.isDirectory()) addFolder(tree, rel, walkLocal(path.join(dir, entry.name), rel));
    else tree.files.add(rel);
  }
  return tree;
}

async function walkRemote(ftp, dir, base = '') {
  const tree = emptyTree();
  for (const entry of await ftp.list(dir)) {
    if (entry.name === '.' || entry.name === '..') continue;
    if (!base && PROTECTED.has(entry.name)) continue;
    const rel = joinRel(base, entry.name);
    if (entry.isDirectory) addFolder(tree, rel, await walkRemote(ftp, path.posix.join(dir, entry.name), rel));
    else tree.files.add(rel);
  }
  return tree;
}

async function printRemoteFolder(ftp, { host, root, secure }) {
  console.log(`✔ connected to ${host} (${secure ? 'FTPS' : 'unencrypted FTP'}). Start folder: ${await ftp.pwd()}`);
  let entries;
  try {
    entries = await ftp.list(root);
  } catch {
    console.log(`${root} does not exist yet; the deploy will create it.`);
    return;
  }
  console.log(`\n${root} (${entries.length} entries):`);
  for (const entry of entries) {
    const type = entry.isDirectory ? '[dir] ' : '      ';
    const size = entry.isDirectory ? '' : `  (${entry.size} B)`;
    console.log(`  ${type}${entry.name}${size}${PROTECTED.has(entry.name) ? '  [protected]' : ''}`);
  }
  console.log('\nA deploy deletes everything that is not [protected] and does not exist in dist/.');
}

function build() {
  const { status } = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (status !== 0) throw new DeployError('The build failed.');
}

async function folderExists(ftp, dir) {
  try {
    await ftp.list(dir);
    return true;
  } catch (err) {
    // servers use different 4xx/5xx codes for a missing folder; anything else is a connection problem
    if (err instanceof FTPError) return false;
    throw err;
  }
}

async function refuseHomeFolder(ftp, root) {
  const names = (await ftp.list(root)).map((entry) => entry.name);
  const found = names.filter((name) => HOME_MARKERS.includes(name));
  if (!found.length) return;
  throw new DeployError(
    `${root} looks like the home folder of the account (it contains: ${found.join(', ')}), not the site folder.\n` +
      '  Set FTP_ROOT to the site folder (e.g. /public_html/) and check it with `npm run deploy:check`.',
  );
}

/** What to delete: whole folders where possible, then the remaining single files. */
function findStale(local, remote) {
  const isInside = (rel, dirs) => dirs.some((dir) => rel.startsWith(`${dir}/`));
  const staleDirs = [...remote.dirs].filter((dir) => !local.dirs.has(dir));
  const dirs = staleDirs.filter((dir) => !isInside(dir, staleDirs));
  const files = [...remote.files].filter((file) => !local.files.has(file) && !isInside(file, dirs));
  return { dirs, files };
}

function printPlan({ host, root }, local, stale) {
  console.log(`\n${host}:${root}`);
  console.log(`  to upload: ${local.files.size} files`);
  console.log(`  to delete: ${stale.files.length} old files, ${stale.dirs.length} old folders`);
  stale.dirs.forEach((dir) => console.log(`    - ${dir}/`));
  stale.files.forEach((file) => console.log(`    - ${file}`));
}

async function backUp(ftp, root) {
  const dir = path.resolve('.deploy-backups', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(dir, { recursive: true });
  await ftp.downloadToDir(dir, root);
  console.log(`\n  backup: ${dir}`);
}

async function upload(ftp, root, stale) {
  process.stdout.write('\n▶ uploading...');
  await ftp.uploadFromDir(DIST, root);
  console.log(' done');
  for (const dir of stale.dirs) await ftp.removeDir(path.posix.join(root, dir));
  for (const file of stale.files) await ftp.remove(path.posix.join(root, file));
  console.log(`✔ deployed${stale.files.length || stale.dirs.length ? ', old files deleted' : ''}.`);
}

async function listRemote(ftp, root) {
  try {
    return await walkRemote(ftp, root);
  } catch {
    // treated as a new folder: nothing to delete
    return emptyTree();
  }
}

async function deploy(ftp, config, { dryRun, backup }) {
  const { root } = config;
  const local = walkLocal(DIST);
  const isMissing = dryRun && !(await folderExists(ftp, root));
  if (!dryRun) await ftp.ensureDir(root);
  if (!isMissing) await refuseHomeFolder(ftp, root);
  const remote = isMissing ? emptyTree() : await listRemote(ftp, root);
  const stale = findStale(local, remote);
  printPlan(config, local, stale);
  if (dryRun) {
    console.log('\n(--dry-run: nothing was changed)');
    return;
  }
  if (backup && remote.files.size) await backUp(ftp, root);
  await upload(ftp, root, stale);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const config = readConfig();
  const isCheck = args.has('--check');
  if (!isCheck) {
    if (!args.has('--no-build')) build();
    if (!existsSync(path.join(DIST, 'index.html')))
      throw new DeployError('dist/index.html is missing. Run the build first.');
  }
  const ftp = await connect(config);
  try {
    if (isCheck) await printRemoteFolder(ftp, config);
    else await deploy(ftp, config, { dryRun: args.has('--dry-run'), backup: args.has('--backup') });
  } finally {
    ftp.close();
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof DeployError ? `✖ ${err.message}` : `\n✖ FTP error: ${err?.message ?? err}`);
  process.exitCode = 1;
}
