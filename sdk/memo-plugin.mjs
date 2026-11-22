import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32 } from "node:zlib";

const MAX_ARCHIVE = 8 * 1024 * 1024;
const PUBLISHER = /^[a-z0-9][a-z0-9._-]{0,127}(?<!\.)$/;
const PLUGIN = /^(?!host\.)(?!memo\.internal\.state\.)[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const HASH = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const ASSET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.memoplugin$/;
const RELEASE_CDN = new Set(["release-assets.githubusercontent.com", "objects.githubusercontent.com"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function requireValue(valid, description) {
    if (!valid) throw new Error(description);
}

export function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

function fieldSet(value, fields) {
    requireValue(value && typeof value === "object" && !Array.isArray(value) &&
        Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)),
        "Unexpected or missing manifest field");
}

function publicDer(key) {
    requireValue(key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails.namedCurve === "prime256v1",
        "A P-256 signing key is required");
    return (key.type === "public" ? key : createPublicKey(key)).export({ type: "spki", format: "der" });
}

export function developerIdentity() {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    return {
        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
        publicKey: publicDer(publicKey)
    };
}

const runtimeFiles = {
    "javascript/1": ["script.js"],
    "web-panel/1": ["index.html"],
    "activity/1": [],
    "review/1": ["review.txt"],
    "review-client/1": [],
    "formula/1": []
};
const runtimeFields = {
    "activity/1": ["androidPackage", "activityClass", "apkSignerSha256"],
    "review-client/1": ["providerId", "providerSignerSha256", "minProviderVersion", "maxProviderVersion"],
    "formula/1": ["androidPackage", "serviceClass", "apkSignerSha256"]
};
const compositionFormats = {
    "state-composition.json": ["memo.state-composition/1", [], ["program.json"]],
    "note-query.json": ["memo.note-query/1", ["openResult"], ["program.json"]],
    "confirmed-action.json": ["memo.confirmed-action/1", ["action"], []]
};

function parseManifest(files, fingerprint) {
    const known = ["runtime.json", "manifest.json", ...Object.keys(compositionFormats)];
    const candidates = known.filter(name => files.has(name));
    requireValue(candidates.length === 1, "Use exactly one release manifest");
    const name = candidates[0];
    const source = files.get(name);
    requireValue(source.length > 0 && source.length <= 8192, "Invalid manifest size");
    const manifest = JSON.parse(UTF8.decode(source));
    requireValue(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Expected a manifest object");
    const common = ["format", "publisher", "id", "versionCode", "signerSha256"];
    if (fingerprint && manifest.signerSha256 === undefined) manifest.signerSha256 = fingerprint;
    requireValue(PUBLISHER.test(manifest.publisher) && typeof manifest.publisher === "string" &&
        PLUGIN.test(manifest.id) && typeof manifest.id === "string" && manifest.id.length <= 128 &&
        Number.isSafeInteger(manifest.versionCode) && manifest.versionCode > 0 &&
        typeof manifest.signerSha256 === "string" && HASH.test(manifest.signerSha256) &&
        (!fingerprint || fingerprint === manifest.signerSha256), "Invalid publisher, plugin ID, version or signer");
    let extra;
    if (name === "runtime.json") {
        const type = manifest.template;
        requireValue(Object.hasOwn(runtimeFiles, type) && manifest.protocol === 1 && manifest.format === 1,
            "Unsupported runtime template or protocol");
        const fields = [...common, "protocol", "template", "permissions", ...(runtimeFields[type] ?? [])];
        if (type === "review/1" && Object.hasOwn(manifest, "exportReview")) {
            requireValue(manifest.exportReview === true, "Invalid review export option");
            fields.push("exportReview");
        }
        fieldSet(manifest, fields);
        const permission = type === "activity/1" ? [] : [type === "formula/1" ? "QUERY_NOTES" : "PLUGIN_STATE"];
        requireValue(JSON.stringify(manifest.permissions) === JSON.stringify(permission), "Incorrect runtime permissions");
        if (manifest.apkSignerSha256 !== undefined) {
            const component = manifest.activityClass ?? manifest.serviceClass;
            requireValue(typeof manifest.apkSignerSha256 === "string" && HASH.test(manifest.apkSignerSha256) &&
                typeof manifest.androidPackage === "string" && manifest.androidPackage.length <= 255 &&
                /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(manifest.androidPackage) &&
                typeof component === "string" && component.length <= 255 &&
                /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(component),
                "Invalid companion package, component or certificate fingerprint");
        }
        if (type === "review-client/1") {
            requireValue(typeof manifest.providerId === "string" && PLUGIN.test(manifest.providerId) &&
                manifest.providerId.length <= 128 && manifest.providerId !== manifest.id &&
                typeof manifest.providerSignerSha256 === "string" && HASH.test(manifest.providerSignerSha256) &&
                Number.isSafeInteger(manifest.minProviderVersion) && manifest.minProviderVersion > 0 &&
                Number.isSafeInteger(manifest.maxProviderVersion) && manifest.maxProviderVersion >= manifest.minProviderVersion,
                "Invalid review provider identity or version range");
        }
        extra = runtimeFiles[type];
    } else if (name === "manifest.json") {
        requireValue(manifest.format === 1 && manifest.protocol === 1 && manifest.template === "quick-capture/1",
            "Unsupported quick capture template");
        const fields = [...common, "protocol", "template", "permissions"];
        if (Object.hasOwn(manifest, "surfaceSlots")) {
            fields.push("surfaceSlots");
            requireValue(Array.isArray(manifest.surfaceSlots) && manifest.surfaceSlots.length === new Set(manifest.surfaceSlots).size &&
                manifest.surfaceSlots.every(slot => ["HOME", "EDITOR", "PROJECT", "AI_ASSISTANT"].includes(slot)), "Invalid surface slots");
        }
        fieldSet(manifest, fields);
        requireValue(Array.isArray(manifest.permissions) && manifest.permissions.length === 2 &&
            manifest.permissions.includes("APPEND_DIARY") && manifest.permissions.includes("OPEN_NOTE"),
            "Incorrect quick capture permissions");
        extra = [];
    } else {
        const [format, fields, assets] = compositionFormats[name];
        requireValue(manifest.format === format, "Unsupported declarative template");
        fieldSet(manifest, [...common, ...fields]);
        if (name === "note-query.json") requireValue(typeof manifest.openResult === "boolean", "Expected boolean openResult");
        if (name === "confirmed-action.json") requireValue(["remind", "ask"].includes(manifest.action), "Unsupported confirmed action");
        extra = assets;
    }
    requireValue(files.size === extra.length + 1 && extra.every(file => files.has(file)),
        "Package files do not match the template");
    if (files.has("script.js")) {
        const script = files.get("script.js");
        requireValue(script.length > 0 && script.length <= 65536, "Script size is outside the runtime limit");
        UTF8.decode(script);
    }
    if (files.has("index.html")) {
        const markup = files.get("index.html");
        requireValue(markup.length > 0 && markup.length <= 256 * 1024, "HTML size is outside the runtime limit");
        requireValue(UTF8.decode(markup).trim().length > 0, "The HTML panel is empty");
    }
    if (files.has("review.txt")) {
        const review = files.get("review.txt");
        requireValue(review.length > 0 && review.length <= 4096 &&
            review.every(byte => (byte >= 32 && byte <= 126) || [9, 10, 13].includes(byte)), "Invalid review script size or encoding");
    }
    if (files.has("program.json")) {
        const program = files.get("program.json");
        requireValue(program.length > 0 && program.length <= 32768, "Invalid declarative program size");
        const parsed = JSON.parse(UTF8.decode(program));
        requireValue(parsed?.format === "memo.composition-draft/1", "Unsupported declarative program format");
    }
    return { name, manifest };
}

function zipStored(files) {
    const chunks = [];
    const directory = [];
    let offset = 0;
    for (const [file, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, "en"))) {
        const name = Buffer.from(file, "ascii");
        const crc = crc32(bytes);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x21, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(bytes.length, 18);
        local.writeUInt32LE(bytes.length, 22);
        local.writeUInt16LE(name.length, 26);
        chunks.push(local, name, bytes);
        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50, 0);
        record.writeUInt16LE(20, 4);
        record.writeUInt16LE(20, 6);
        record.writeUInt16LE(0x21, 14);
        record.writeUInt32LE(crc, 16);
        record.writeUInt32LE(bytes.length, 20);
        record.writeUInt32LE(bytes.length, 24);
        record.writeUInt16LE(name.length, 28);
        record.writeUInt32LE(offset, 42);
        directory.push(record, name);
        offset += local.length + name.length + bytes.length;
    }
    const index = Buffer.concat(directory);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.size, 8);
    end.writeUInt16LE(files.size, 10);
    end.writeUInt32LE(index.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...chunks, index, end]);
}

export async function packPlugin(directory, signer) {
    const fingerprint = sha256(publicDer(signer));
    const files = new Map();
    const names = await readdir(directory);
    requireValue(names.length >= 1 && names.length <= 2, "Put only release files in the input directory");
    for (const name of names) {
        const path = join(directory, name);
        const entry = await lstat(path);
        requireValue(entry.isFile() && entry.size <= MAX_ARCHIVE && /^[a-z][a-z0-9.-]{0,127}$/.test(name),
            "Put only regular release files in the input directory");
        files.set(name, await readFile(path));
    }
    const { name, manifest } = parseManifest(files, fingerprint);
    const signedManifest = Buffer.from(JSON.stringify(manifest) + "\n");
    requireValue(signedManifest.length <= 8192, "Signed manifest exceeds the runtime limit");
    files.set(name, signedManifest);
    const zip = zipStored(files);
    requireValue(zip.length <= MAX_ARCHIVE, "Plugin archive is too large");
    const signature = sign("sha256", zip, signer).toString("base64");
    return Buffer.concat([Buffer.from(`MEMOPLUGIN/1\n${manifest.publisher}\n${sha256(zip)}\n${signature}\n`), zip]);
}

function readEnvelope(bytes, key) {
    publicDer(key);
    requireValue(bytes.length <= MAX_ARCHIVE + 512, "Plugin file is too large");
    let start = 0;
    const values = [];
    for (const limit of [12, 128, 64, 172]) {
        const line = bytes.indexOf(10, start);
        requireValue(line > start && line - start <= limit, "Invalid plugin header");
        const part = bytes.subarray(start, line);
        requireValue(part.every(byte => byte >= 33 && byte <= 126), "Invalid header encoding");
        values.push(part.toString("ascii"));
        start = line + 1;
    }
    const [format, publisher, hash, encoded] = values;
    const zip = bytes.subarray(start);
    const signature = Buffer.from(encoded, "base64");
    requireValue(format === "MEMOPLUGIN/1" && PUBLISHER.test(publisher) && HASH.test(hash) &&
        encoded === signature.toString("base64") && zip.length <= MAX_ARCHIVE &&
        hash === sha256(zip) && verify("sha256", zip, key, signature), "Package signature or digest mismatch");
    const summary = { publisher, zipSha256: hash, assetSha256: sha256(bytes), signerSha256: sha256(publicDer(key)), size: bytes.length };
    return { zip, summary };
}

export function verifyEnvelope(bytes, key) {
    return readEnvelope(bytes, key).summary;
}

export function reviewAsset(bytes, key, repository, assetId, fileName, title) {
    requireValue(REPOSITORY.test(repository) && Number.isSafeInteger(assetId) && assetId > 0 && ASSET.test(fileName) &&
        title.trim().length > 0 && title.length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/.test(title),
        "Invalid GitHub asset coordinates or listing title");
    const { zip, summary } = readEnvelope(bytes, key);
    const files = new Map();
    let offset = 0;
    while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
        requireValue(files.size < 2 && zip.readUInt16LE(offset + 8) === 0 && zip.readUInt16LE(offset + 28) === 0,
            "Run the SDK pack command to create a supported review archive");
        const nameStart = offset + 30;
        const dataStart = nameStart + zip.readUInt16LE(offset + 26);
        const end = dataStart + zip.readUInt32LE(offset + 18);
        requireValue(end <= zip.length, "Truncated review archive");
        const name = zip.subarray(nameStart, dataStart).toString("latin1");
        requireValue(/^[a-z][a-z0-9.-]{0,127}$/.test(name) && !files.has(name), "Invalid or duplicate archive entry");
        files.set(name, zip.subarray(dataStart, end));
        offset = end;
    }
    requireValue(files.size > 0 && zipStored(files).equals(zip), "Archive differs from the output of the SDK pack command");
    const { name, manifest } = parseManifest(files);
    requireValue(manifest.publisher === summary.publisher && manifest.signerSha256 === summary.signerSha256 &&
        JSON.stringify(manifest) + "\n" === UTF8.decode(files.get(name)), "Manifest identity or encoding mismatch");
    const { publisher, id, signerSha256, versionCode } = manifest;
    const listing = { identity: { publisher, id, signerSha256, versionCode }, title, repository, assetId, fileName,
        size: summary.size, sha256: summary.assetSha256, publisherKey: publicDer(key).toString("base64") };
    return { listing, manifest };
}

async function downloadBytes(response, limit) {
    requireValue(response.status === 200 && response.body, `GitHub returned HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
        size += chunk.length;
        requireValue(size <= limit, "GitHub response exceeds the review size limit");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
}

export async function reviewGitHubRelease(repository, tag, fileName, key, title, transport = fetch) {
    requireValue(REPOSITORY.test(repository) && typeof tag === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(tag) &&
        ASSET.test(fileName), "Invalid owner/repository, release tag or asset file name");
    const base = `https://api.github.com/repos/${repository}/releases`;
    const signal = AbortSignal.timeout(20000);
    function request(url, accept) {
        return transport(url, { redirect: "manual", signal, headers: { Accept: accept, "User-Agent": "Memo-Plugin-Market" } });
    }
    const releaseBody = await request(`${base}/tags/${encodeURIComponent(tag)}`, "application/vnd.github+json");
    const release = JSON.parse(UTF8.decode(await downloadBytes(releaseBody, 512 * 1024)));
    requireValue(release.tag_name === tag && release.draft === false && release.prerelease === false &&
        Array.isArray(release.assets) && release.assets.length <= 128, "Expected a public stable release of the exact tag");
    const assets = release.assets.filter(asset => asset?.name === fileName && asset.state === "uploaded");
    requireValue(assets.length === 1, "Expected one uploaded asset with the requested name");
    const [asset] = assets;
    const endpoint = `${base}/assets/${asset.id}`;
    requireValue(Number.isSafeInteger(asset.id) && asset.id > 0 && Number.isSafeInteger(asset.size) &&
        asset.size > 0 && asset.size <= MAX_ARCHIVE + 512 && typeof asset.url === "string" &&
        asset.url.toLowerCase() === endpoint.toLowerCase() && /^sha256:[a-f0-9]{64}$/.test(asset.digest),
        "Release metadata is missing a valid asset ID, size or GitHub digest");
    let download = await request(endpoint, "application/octet-stream");
    if (download.status === 302) {
        const location = download.headers.get("location");
        await download.body?.cancel();
        requireValue(location && location.length <= 8192 && /^[\x21-\x7e]+$/.test(location) && !location.includes("\\"),
            "Invalid GitHub release asset redirect");
        const target = new URL(location);
        requireValue(target.protocol === "https:" && RELEASE_CDN.has(target.hostname) && !target.port &&
            !target.username && !target.password && !target.hash && target.pathname.startsWith("/github-production-release-asset/"),
            "GitHub release asset left the download host allowlist");
        download = await request(target.toString(), "application/octet-stream");
    }
    const body = await downloadBytes(download, asset.size);
    requireValue(body.length === asset.size && `sha256:${sha256(body)}` === asset.digest, "GitHub asset size or digest mismatch");
    return reviewAsset(body, key, repository, asset.id, fileName, title);
}

export function signCatalog(body, key) {
    publicDer(key);
    requireValue(body.length > 0 && body.length <= 512 * 1024, "Invalid market directory size");
    JSON.parse(UTF8.decode(body));
    return Buffer.concat([Buffer.from(`MEMOCATALOG/1\n${sign("sha256", body, key).toString("base64")}\n`), body]);
}

async function main([mode, ...args]) {
    if (mode === "keygen" && args.length === 2) {
        const keys = developerIdentity();
        await writeFile(args[0], keys.privateKey, { flag: "wx", mode: 0o600 });
        await writeFile(args[1], keys.publicKey, { flag: "wx" });
        process.stdout.write(sha256(keys.publicKey) + "\n");
    } else if (mode === "pack" && args.length === 3) {
        const [directory, key, output] = args;
        const bytes = await packPlugin(directory, createPrivateKey(await readFile(key)));
        await writeFile(output, bytes, { flag: "wx" });
        process.stdout.write(`${basename(output)} ${sha256(bytes)}\n`);
    } else if (mode === "verify" && args.length === 2) {
        const [file, key] = args;
        const result = verifyEnvelope(await readFile(file),
            createPublicKey({ key: await readFile(key), type: "spki", format: "der" }));
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else if (mode === "review-asset" && args.length === 5) {
        const [file, key, repository, assetId, title] = args;
        requireValue(/^[1-9][0-9]*$/.test(assetId), "Invalid GitHub asset ID");
        const publicKey = createPublicKey({ key: await readFile(key), type: "spki", format: "der" });
        const result = reviewAsset(await readFile(file), publicKey, repository, Number(assetId), basename(file), title);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else if (mode === "review-github" && args.length === 5) {
        const [repository, tag, file, key, title] = args;
        const publicKey = createPublicKey({ key: await readFile(key), type: "spki", format: "der" });
        const result = await reviewGitHubRelease(repository, tag, file, publicKey, title);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else if (mode === "sign-catalog" && args.length === 3) {
        const [file, key, output] = args;
        await writeFile(output, signCatalog(await readFile(file), createPrivateKey(await readFile(key))), { flag: "wx" });
    } else {
        throw new Error("Usage: keygen PRIVATE.pem PUBLIC.der | pack DIR PRIVATE.pem OUT.memoplugin | verify FILE PUBLIC.der | review-asset FILE PUBLIC.der OWNER/REPO ASSET_ID TITLE | review-github OWNER/REPO TAG FILE PUBLIC.der TITLE | sign-catalog JSON PRIVATE.pem OUT.memocatalog");
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main(process.argv.slice(2)).catch(error => {
        process.stderr.write(error.message + "\n");
        process.exitCode = 1;
    });
}
