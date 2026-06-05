import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Write a minimal macOS bundle Info.plist to pkgPath/Info.plist.
 * Declares UTI cz.xlab.showx.package so Finder treats the directory as a package.
 * Idempotent — safe to call on every save.
 * Uses string concatenation to avoid an external plist dependency.
 */
export async function writeInfoPlist(pkgPath: string, showTitle: string): Promise<void> {
  const safeTitle = showTitle.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleTypeRole</key>
  <string>Editor</string>
  <key>CFBundleDisplayName</key>
  <string>${safeTitle}</string>
  <key>LSItemContentTypes</key>
  <array>
    <string>cz.xlab.showx.package</string>
  </array>
  <key>LSHandlerRank</key>
  <string>Owner</string>
</dict>
</plist>
`;

  await fs.writeFile(path.join(pkgPath, 'Info.plist'), plist, 'utf8');
}
