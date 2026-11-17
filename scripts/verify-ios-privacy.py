"""Verify our declared privacy data and its inclusion at the iOS bundle root.

This checks packaging and policy consistency, not Apple's full API/SDK audit.
"""
import json
import pathlib
import plistlib
import struct
import sys

root = pathlib.Path(__file__).resolve().parent.parent
source = root / "src-tauri/PrivacyInfo.xcprivacy"
path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else source
bundle = path if path.is_dir() else None
if bundle:
    path = bundle / "PrivacyInfo.xcprivacy"
if not path.is_file():
    candidates = sorted(str(p.relative_to(bundle)) for p in bundle.rglob("*.xcprivacy")) if bundle else []
    raise SystemExit(f"Missing iOS privacy manifest at expected location; found: {candidates}")
manifest = plistlib.loads(path.read_bytes())
expected = plistlib.loads(source.read_bytes())
if manifest != expected:
    raise SystemExit("Bundled privacy manifest differs from the reviewed source")
assert manifest["NSPrivacyTracking"] is False
assert manifest["NSPrivacyTrackingDomains"] == []
collected = manifest["NSPrivacyCollectedDataTypes"]
collected_types = {entry["NSPrivacyCollectedDataType"] for entry in collected}
# Optional hosted login processes account identity, not the user's case files.
assert len(collected) == 3 and collected_types == {
    "NSPrivacyCollectedDataTypeUserID",
    "NSPrivacyCollectedDataTypeEmailAddress",
    "NSPrivacyCollectedDataTypeName",
}
for entry in collected:
    assert entry["NSPrivacyCollectedDataTypeLinked"] is True
    assert entry["NSPrivacyCollectedDataTypeTracking"] is False
    assert entry["NSPrivacyCollectedDataTypePurposes"] == ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
categories = {
    entry["NSPrivacyAccessedAPIType"]: set(entry["NSPrivacyAccessedAPITypeReasons"])
    for entry in manifest["NSPrivacyAccessedAPITypes"]
}
assert categories == {
    "NSPrivacyAccessedAPICategoryFileTimestamp": {"C617.1", "3B52.1"},
    # Rust Instant measures snapshot cache age; no boot time is transmitted.
    "NSPrivacyAccessedAPICategorySystemBootTime": {"35F9.1"},
}


def imports(binary):
    """Inspect our thin 64-bit Mach-O, retaining undefined symbols only."""
    data = binary.read_bytes()
    if data[:4] != b"\xcf\xfa\xed\xfe":
        raise SystemExit(f"Expected a thin 64-bit Mach-O: {binary.name}")
    count = struct.unpack_from("<I", data, 16)[0]
    offset = 32
    symbols, libraries = set(), set()
    for _ in range(count):
        command, size = struct.unpack_from("<II", data, offset)
        if size < 8 or offset + size > len(data):
            raise SystemExit("Invalid Mach-O load command")
        if command in (0xC, 0x80000018, 0x8000001F, 0x80000023):
            name = offset + struct.unpack_from("<I", data, offset + 8)[0]
            end = data.index(b"\0", name, offset + size)
            libraries.add(data[name:end].decode("utf8"))
        if command == 2:
            symoff, nsyms, stroff, strsize = struct.unpack_from("<4I", data, offset + 8)
            if symoff + nsyms * 16 > len(data) or stroff + strsize > len(data):
                raise SystemExit("Invalid Mach-O symbol table")
            for index in range(nsyms):
                strx, kind, _, _, _ = struct.unpack_from("<IBBHQ", data, symoff + index * 16)
                if kind & 0xE == 0 and 0 < strx < strsize:
                    name = stroff + strx
                    end = data.index(b"\0", name, stroff + strsize)
                    symbols.add(data[name:end].decode("utf8", errors="replace"))
        offset += size
    return symbols, libraries


report = {"privacyManifest": "verified", "tracking": False, "categories": sorted(categories), "collectedDataTypes": sorted(collected_types)}
if bundle:
    info = plistlib.loads((bundle / "Info.plist").read_bytes())
    if info.get("ITSAppUsesNonExemptEncryption") is not False:
        raise SystemExit("Missing or unexpected non-exempt encryption declaration")
    binaries = [bundle / info["CFBundleExecutable"], *bundle.glob("*.debug.dylib")]
    symbols, libraries = set(), set()
    for binary in binaries:
        found_symbols, found_libraries = imports(binary)
        symbols.update(found_symbols)
        libraries.update(found_libraries)
    blocked = symbols & {"_statfs", "_fstatfs", "_statvfs", "_fstatvfs", "_OBJC_CLASS_$_NSUserDefaults"}
    report["requiredReasonApiCandidates"] = sorted(blocked | (symbols & {"_mach_absolute_time"}))
    # Elapsed-time access is declared as 35F9.1 above; keep it visible in the audit.
    # Unoptimized simulator binaries retain unused dependency functions. Keep
    # those candidates visible, and enforce their audit on the release IPA.
    if blocked and "--debug" not in sys.argv:
        raise SystemExit(f"Review undeclared required-reason API imports: {sorted(blocked)}")
    if not any(name.endswith("/libsqlite3.dylib") for name in libraries):
        raise SystemExit("iOS must link Apple's system SQLite; check for leaked bundled features")
    report["systemSqlite"] = True
    report["checkedBinaries"] = [binary.name for binary in binaries]
print(json.dumps(report))
