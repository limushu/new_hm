import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { selectSimulatorRuntime, simulatorProjectTemplate } from './ios-simulator-config.mjs';
const runtime = (version, isAvailable = true) => ({
  version,
  isAvailable,
  identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replaceAll('.', '-')}`,
});
test('mixed Xcode images use the newest available SDK-compatible runtime, not an unsupported newer OS', () => {
  const runtimes = [
    runtime('26.2'),
    runtime('18.5.1'),
    runtime('18.4'),
    runtime('18.5.2', false),
    { ...runtime('18.5'), identifier: 'com.apple.CoreSimulator.SimRuntime.tvOS-18-5' },
  ];
  expect(selectSimulatorRuntime(runtimes, '18.5').version).toBe('18.5.1');
  expect(selectSimulatorRuntime(runtimes, '26.2').version).toBe('26.2');
  expect(runtimes[0].version).toBe('26.2');
});
test('unsupported or missing runtime fails clearly instead of booting an incompatible device', () => {
  expect(() => selectSimulatorRuntime([runtime('26.2')], '18.5')).toThrow(
    'No iOS simulator runtime compatible',
  );
  expect(() => selectSimulatorRuntime([runtime('18.5', false)], '18.5')).toThrow(
    'No iOS simulator runtime compatible',
  );
  expect(() => selectSimulatorRuntime([runtime('18.5')], 'unavailable')).toThrow(
    'Cannot determine',
  );
});

test('simulator projects pin their SDK without changing the distribution template or resources', () => {
  const template = readFileSync(new URL('../src-tauri/ios-project.yml', import.meta.url), 'utf8');
  const simulator = simulatorProjectTemplate(template);
  expect(simulator).toContain(
    '        SDKROOT: iphonesimulator\n        SUPPORTED_PLATFORMS: iphonesimulator',
  );
  expect(
    simulator.replace(
      '\n        SDKROOT: iphonesimulator\n        SUPPORTED_PLATFORMS: iphonesimulator',
      '',
    ),
  ).toBe(template);
  expect(readFileSync(new URL('../src-tauri/ios-project.yml', import.meta.url), 'utf8')).toBe(
    template,
  );
});
test('a changed or ambiguous project template fails instead of silently testing the wrong SDK', () => {
  expect(() => simulatorProjectTemplate('settings: {}')).toThrow('Expected one');
  expect(() =>
    simulatorProjectTemplate('        ENABLE_BITCODE: false\n        ENABLE_BITCODE: false'),
  ).toThrow('Expected one');
});
