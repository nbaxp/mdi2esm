// 把本仓库以 file:.. 安装进 demo：npm 在 lockfile 未变时不会重新打包目录型
// file: 依赖，所以每次先移除旧副本，确保 demo 用的是刚构建出来的 dist。
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

rmSync(resolve(here, 'node_modules', 'mdi2esm'), { recursive: true, force: true });

const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['install', '--install-links', '--no-audit', '--no-fund'],
  { cwd: here, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
