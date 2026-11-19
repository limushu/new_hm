/** A runner may have runtimes installed by a different Xcode. Do not select a
 * newer OS than the SDK of the Xcode actually building and launching the app. */
export function selectSimulatorRuntime(runtimes, sdkVersion) {
  const version = (value) => {
    if (!/^\d+(?:\.\d+){0,2}$/.test(value ?? '')) return null;
    const [major, minor = '0'] = value.split('.');
    return Number(major) * 1000 + Number(minor);
  };
  const sdk = version(sdkVersion);
  if (sdk === null) throw new Error('Cannot determine the selected Xcode simulator SDK version');
  const selected = runtimes
    .filter(
      (runtime) =>
        runtime.isAvailable &&
        runtime.identifier.includes('.iOS-') &&
        version(runtime.version) !== null &&
        version(runtime.version) <= sdk,
    )
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  if (!selected)
    throw new Error(`No iOS simulator runtime compatible with selected SDK ${sdkVersion}`);
  return selected;
}

/** Intel archives can otherwise resolve the generic destination to iphoneos,
 * where x86_64 is excluded. Pin the disposable simulator project itself; the
 * distribution template and signing configuration remain untouched. */
export function simulatorProjectTemplate(template) {
  const marker = '        ENABLE_BITCODE: false';
  if (template.split(marker).length !== 2)
    throw new Error('Expected one iOS application build-settings block');
  return template.replace(
    marker,
    `${marker}\n        SDKROOT: iphonesimulator\n        SUPPORTED_PLATFORMS: iphonesimulator`,
  );
}
