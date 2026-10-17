import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

let failed = false;
function run(command, args) {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
  return { ok: r.status === 0, text: (r.stdout || r.stderr || r.error?.message || '').trim() };
}
for (const [label, command, args] of [
  ['Node.js', 'node', ['--version']],
  ['Rust', 'rustc', ['--version']],
  ['Cargo', 'cargo', ['--version']],
]) {
  const result = run(command, args);
  console.log(`${result.ok ? 'OK' : 'MISSING'} ${label}: ${result.text}`);
  if (!result.ok) failed = true;
}
if (process.platform === 'win32') {
  const vswhere = `${process.env['ProgramFiles(x86)']}\\Microsoft Visual Studio\\Installer\\vswhere.exe`;
  const result = existsSync(vswhere)
    ? run(vswhere, [
        '-latest',
        '-products',
        '*',
        '-requires',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
        '-property',
        'installationPath',
      ])
    : { ok: false, text: '' };
  const present = result.ok && result.text.length > 0;
  console.log(
    `${present ? 'OK' : 'MISSING'} Windows C++ 构建工具${present ? `: ${result.text}` : '：请安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”及 Windows SDK。'}`,
  );
  if (!present) failed = true;
}
console.log('桌面开发：npm run desktop:dev；Rust 测试：npm run test:core');
if (failed) {
  console.log('依赖说明：https://v2.tauri.app/start/prerequisites/');
  process.exitCode = 1;
}
