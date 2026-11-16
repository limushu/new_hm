import { expect, test } from 'vitest';
import { selectSimulatorRuntime } from './ios-simulator-config.mjs';
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
