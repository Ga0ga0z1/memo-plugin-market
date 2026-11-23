import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The expected identity comes from the separately authenticated plugin manifest.
export function checkApkIdentity(badging, certificateInfo, expectedPackage, expectedSigner) {
    const packageName = /^package: name='([^']+)'/m.exec(badging)?.[1];
    if (!packageName || packageName !== expectedPackage) {
        throw new Error("APK package differs from the signed plugin manifest");
    }
    const signers = [...certificateInfo.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([a-f0-9]{64})\s*$/gim)];
    if (signers.length !== 1 || signers[0][1].toLowerCase() !== expectedSigner) {
        throw new Error("Expected the single current APK signer from the signed plugin manifest");
    }
    const launcherActivities = [...badging.matchAll(/^launchable-activity: name='([^']+)'/gm)].map(match => match[1]);
    const permissions = [...badging.matchAll(/^uses-permission(?:-sdk-\d+)?: name='([^']+)'/gm)].map(match => match[1]);
    return { packageName, apkSignerSha256: expectedSigner, launcherActivities, permissions };
}

async function main([buildTools, apk, expectedPackage, expectedSigner, ...extra]) {
    if (!buildTools || !apk || !expectedPackage || !/^[a-f0-9]{64}$/.test(expectedSigner ?? "") || extra.length) {
        throw new Error("Usage: node sdk/review-companion.mjs BUILD_TOOLS APK ANDROID_PACKAGE APK_SIGNER_SHA256");
    }
    const windows = process.platform === "win32";
    const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", windows ? "java.exe" : "java") : "java";
    const path = resolve(apk);
    const options = { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 };
    const certificateInfo = execFileSync(java, ["-jar", join(buildTools, "lib", "apksigner.jar"),
        "verify", "--print-certs", path], options);
    const badging = execFileSync(join(buildTools, windows ? "aapt2.exe" : "aapt2"), ["dump", "badging", path], options);
    const report = checkApkIdentity(badging, certificateInfo, expectedPackage, expectedSigner);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    console.log(JSON.stringify({ apkSha256: hash.digest("hex"), ...report }, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main(process.argv.slice(2)).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
