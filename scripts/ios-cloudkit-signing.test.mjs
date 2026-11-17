import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cloudEntitlementsValid,
  cloudProjectTemplate,
  verifyCloudSchema,
} from './ios-cloudkit-signing.mjs';
describe('CloudKit release gate', () => {
  it('requires the exact production container, service and environment', () => {
    const good = {
      'com.apple.developer.icloud-container-identifiers': ['iCloud.com.limushu.hm'],
      'com.apple.developer.icloud-services': ['CloudKit'],
      'com.apple.developer.icloud-container-environment': 'Production',
    };
    expect(cloudEntitlementsValid(good)).toBe(true);
    for (const key of Object.keys(good))
      expect(cloudEntitlementsValid({ ...good, [key]: undefined })).toBeFalsy();
    expect(
      cloudEntitlementsValid({
        ...good,
        'com.apple.developer.icloud-container-environment': 'Development',
      }),
    ).toBe(false);
  });
  it('activates only a generated signed-build template, leaving simulator defaults local', () => {
    const original = readFileSync(new URL('../src-tauri/ios-project.yml', import.meta.url), 'utf8');
    expect(original).not.toContain('AnjianCloudKitContainer');
    const release = cloudProjectTemplate(original);
    expect(release).toContain('AnjianCloudKitContainer: iCloud.com.limushu.hm');
    expect(release).toContain('com.apple.developer.icloud-container-environment: Production');
    expect(() => cloudProjectTemplate('unrecognized template')).toThrow();
  });
  it('refuses uploads when any production record or field type is missing', () => {
    const schema = readFileSync(new URL('../cloudkit/schema.ckdb', import.meta.url), 'utf8');
    expect(() => verifyCloudSchema(schema)).not.toThrow();
    expect(() => verifyCloudSchema(schema.replace('data ASSET', 'data STRING'))).toThrow();
    expect(() => verifyCloudSchema(schema.replace('AnjianSyncHead', 'OtherHead'))).toThrow();
  });
});
