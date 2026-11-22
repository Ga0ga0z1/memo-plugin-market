import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { developerIdentity, packPlugin, reviewAsset, reviewGitHubRelease, sha256, signCatalog, verifyEnvelope } from "./memo-plugin.mjs";

const keys = developerIdentity();
const signer = createPrivateKey(keys.privateKey);
const publicKey = createPublicKey({ key: keys.publicKey, type: "spki", format: "der" });

test("every published template example packs and passes independent asset review", async () => {
    for (const name of ["format-text", "private-panel", "quick-capture", "state-composition", "note-query",
        "confirmed-reminder", "review-provider", "review-client", "companion-activity", "formula-service"]) {
        const example = fileURLToPath(new URL(`./examples/${name}/`, import.meta.url));
        const bytes = await packPlugin(example, signer);
        const { listing } = reviewAsset(bytes, publicKey, "example/market", 1, name + ".memoplugin", name);
        assert.equal(listing.sha256, sha256(bytes), name);
    }
});

test("authoring rejects mismatched permissions, provider ranges and unsupported actions", async () => {
    const cases = [
        ["quick-capture/manifest.json", { permissions: ["APPEND_DIARY,OPEN_NOTE"] }, /permissions/],
        ["review-client/runtime.json", { maxProviderVersion: 0 }, /version range/],
        ["confirmed-reminder/confirmed-action.json", { action: "schedule" }, /confirmed action/]
    ];
    for (const [source, changes, reason] of cases) {
        const folder = await mkdtemp(join(tmpdir(), "memo-sdk-validation-"));
        try {
            const file = new URL(`./examples/${source}`, import.meta.url);
            const manifest = { ...JSON.parse(await readFile(file, "utf8")), ...changes };
            await writeFile(join(folder, source.split("/")[1]), JSON.stringify(manifest));
            await assert.rejects(packPlugin(folder, signer), reason);
        } finally {
            await rm(folder, { recursive: true });
        }
    }
});

test("the bundled sample produces an authenticated publication and leaves author files unchanged", async () => {
    const example = fileURLToPath(new URL("./examples/format-text/", import.meta.url));
    const original = await readFile(join(example, "runtime.json"), "utf8");
    const pack = await packPlugin(example, signer);
    const info = verifyEnvelope(pack, publicKey);
    assert.equal(info.publisher, "example.author");
    assert.equal(info.signerSha256, sha256(keys.publicKey));
    assert.equal(info.assetSha256, sha256(pack));
    assert.equal(info.size, pack.length);
    assert.equal(await readFile(join(example, "runtime.json"), "utf8"), original);
    const modified = Buffer.from(pack);
    modified[modified.length - 1] ^= 1;
    assert.throws(() => verifyEnvelope(modified, publicKey), /signature or digest/);
    assert.throws(() => verifyEnvelope(pack, createPublicKey(developerIdentity().privateKey)), /signature or digest/);
});

test("the companion template preserves its Android signer and signs a separate publisher identity", async () => {
    const folder = await mkdtemp(join(tmpdir(), "memo-sdk-"));
    try {
        const manifest = {
            format: 1, protocol: 1, template: "activity/1", publisher: "example.author", id: "example.reader",
            versionCode: 3, permissions: [], androidPackage: "example.reader", activityClass: "example.reader.MainActivity",
            apkSignerSha256: "c".repeat(64)
        };
        await writeFile(join(folder, "runtime.json"), JSON.stringify(manifest));
        const pack = await packPlugin(folder, signer);
        assert.ok(pack.includes(Buffer.from(manifest.apkSignerSha256)));
        assert.ok(pack.includes(Buffer.from(sha256(keys.publicKey))));
        await writeFile(join(folder, "extra.js"), "");
        await assert.rejects(packPlugin(folder, signer), /files do not match/);
    } finally {
        await rm(folder, { recursive: true });
    }
});

test("the market key signs the exact directory bytes including the newline", () => {
    const original = Buffer.from('{"format":1}\n');
    const envelope = signCatalog(original, signer);
    const end = envelope.indexOf(10, "MEMOCATALOG/1\n".length);
    const proof = Buffer.from(envelope.subarray("MEMOCATALOG/1\n".length, end).toString("ascii"), "base64");
    assert.deepEqual(envelope.subarray(end + 1), original);
    assert.ok(verify("sha256", original, publicKey, proof));
    assert.ok(!verify("sha256", original.subarray(0, -1), publicKey, proof));
});

test("market review derives the listing identity and permissions from the verified published artifact", async () => {
    const folder = fileURLToPath(new URL("./examples/private-panel/", import.meta.url));
    const pack = await packPlugin(folder, signer);
    const { listing, manifest } = reviewAsset(pack, publicKey, "example/reader", 12, "reader.memoplugin", "Reader");
    assert.deepEqual(listing.identity, {
        publisher: "example.author", id: "example.private-panel", signerSha256: sha256(keys.publicKey), versionCode: 1
    });
    assert.deepEqual(manifest.permissions, ["PLUGIN_STATE"]);
    assert.equal(listing.sha256, sha256(pack));
    assert.equal(listing.publisherKey, keys.publicKey.toString("base64"));
    assert.throws(() => reviewAsset(pack, publicKey, "https://elsewhere/reader", 12, "reader.memoplugin", "Reader"), /coordinates/);
    assert.throws(() => reviewAsset(pack, createPublicKey(developerIdentity().privateKey), "example/reader", 12,
        "reader.memoplugin", "Reader"), /signature or digest/);
});

test("GitHub review pins the publisher release, asset ID, SHA-256, length and download origin", async () => {
    const folder = fileURLToPath(new URL("./examples/private-panel/", import.meta.url));
    const bytes = await packPlugin(folder, signer);
    const base = "https://api.github.com/repos/example/plugins/releases";
    const api = `${base}/assets/12`;
    const cdn = "https://release-assets.githubusercontent.com/github-production-release-asset/sample";
    const name = "reader.memoplugin";
    const release = {
        tag_name: "v1.0.0", draft: false, prerelease: false,
        assets: [{ name, state: "uploaded", id: 12, size: bytes.length, digest: `sha256:${sha256(bytes)}`, url: api }]
    };
    const responses = new Map([
        [`${base}/tags/v1.0.0`, () => Response.json(release)],
        [api, () => new Response(null, { status: 302, headers: { Location: cdn } })],
        [cdn, () => new Response(bytes)]
    ]);
    const calls = [];
    const transport = async (url, options) => {
        assert.equal(options.redirect, "manual");
        calls.push(url);
        assert.ok(responses.has(url));
        return responses.get(url)();
    };
    const run = () => reviewGitHubRelease("example/plugins", "v1.0.0", name, publicKey, "Reader", transport);
    const { listing } = await run();
    assert.equal(listing.assetId, 12);
    assert.equal(listing.sha256, sha256(bytes));
    assert.deepEqual(calls, [`${base}/tags/v1.0.0`, api, cdn]);
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    responses.set(cdn, () => new Response(changed));
    await assert.rejects(run(), /asset size or digest mismatch/);
    responses.set(api, () => new Response(null, { status: 302, headers: { Location: "https://untrusted.invalid/file" } }));
    await assert.rejects(run(), /host allowlist/);
});
