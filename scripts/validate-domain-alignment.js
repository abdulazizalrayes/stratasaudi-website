#!/usr/bin/env node

const dns = require("dns").promises;
const tls = require("tls");

const DOMAIN = "stratasaudi.com";
const WWW_DOMAIN = "www.stratasaudi.com";
const CANONICAL_ORIGIN = "https://www.stratasaudi.com";

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

async function resolveOrEmpty(method, host) {
  try {
    return await dns[method](host);
  } catch (error) {
    if (error && ["ENODATA", "ENOTFOUND", "ENODOMAIN"].includes(error.code)) return [];
    throw error;
  }
}

async function status(url, redirect = "manual") {
  const response = await fetch(url, { method: "HEAD", redirect });
  return {
    status: response.status,
    location: response.headers.get("location") || "",
    server: response.headers.get("server") || "",
  };
}

function certificate(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: true,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve({
          subject: cert.subject,
          issuer: cert.issuer,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
        });
      },
    );
    socket.setTimeout(15000, () => {
      socket.destroy(new Error(`TLS timeout for ${host}`));
    });
    socket.on("error", reject);
  });
}

function caaAllowsVercel(records) {
  if (records.length === 0) return true;
  const issueValues = records.flatMap((record) => {
    if (record.issue) return [record.issue];
    if (record.issuewild) return [record.issuewild];
    if (["issue", "issuewild"].includes(record.tag)) return [record.value];
    return [];
  }).map((value) => String(value || "").toLowerCase());
  return issueValues.some((value) =>
    ["letsencrypt.org", "pki.goog", "sectigo.com", "globalsign.com"].some((authority) =>
      value.includes(authority),
    ),
  );
}

async function main() {
  const [
    apexA,
    apexNs,
    apexCaa,
    wwwCname,
    wwwCaa,
    mx,
    txt,
    dmarc,
    apexHttp,
    wwwHttp,
    apexCert,
    wwwCert,
  ] = await Promise.all([
    resolveOrEmpty("resolve4", DOMAIN),
    resolveOrEmpty("resolveNs", DOMAIN),
    resolveOrEmpty("resolveCaa", DOMAIN),
    resolveOrEmpty("resolveCname", WWW_DOMAIN),
    resolveOrEmpty("resolveCaa", WWW_DOMAIN),
    resolveOrEmpty("resolveMx", DOMAIN),
    resolveOrEmpty("resolveTxt", DOMAIN),
    resolveOrEmpty("resolveTxt", `_dmarc.${DOMAIN}`),
    status(`https://${DOMAIN}`),
    status(CANONICAL_ORIGIN),
    certificate(DOMAIN),
    certificate(WWW_DOMAIN),
  ]);

  expect(apexNs.some((value) => value === "dns1.registrar-servers.com"), "Namecheap NS dns1 missing");
  expect(apexNs.some((value) => value === "dns2.registrar-servers.com"), "Namecheap NS dns2 missing");
  expect(apexA.includes("76.76.21.21"), "Apex domain must point to Vercel 76.76.21.21");
  expect(
    wwwCname.some((value) => value.includes("vercel-dns")),
    "www domain must CNAME to Vercel DNS",
  );
  expect(caaAllowsVercel(apexCaa), "Apex CAA records do not allow Vercel certificate issuance");
  expect(caaAllowsVercel(wwwCaa), "www CAA records do not allow Vercel certificate issuance");
  expect(
    mx.some((record) => record.exchange === "mx1.privateemail.com") &&
      mx.some((record) => record.exchange === "mx2.privateemail.com"),
    "Namecheap Private Email MX records missing",
  );
  expect(
    txt.flat().some((value) => value.includes("include:spf.privateemail.com")),
    "SPF must include Namecheap Private Email",
  );
  expect(dmarc.flat().some((value) => value.startsWith("v=DMARC1")), "DMARC record missing");
  expect(apexHttp.status === 307 && apexHttp.location === `${CANONICAL_ORIGIN}/`, "Apex must redirect to www");
  expect(wwwHttp.status === 200, "Canonical www site must return HTTP 200");
  expect(
    String(apexCert.issuer.O || "").includes("Let's Encrypt") &&
      String(wwwCert.issuer.O || "").includes("Let's Encrypt"),
    "Live Vercel certificates should currently be issued by Let's Encrypt",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        message: "Domain alignment validation passed.",
        domain: DOMAIN,
        canonicalOrigin: CANONICAL_ORIGIN,
        apexA,
        wwwCname,
        apexCaaCount: apexCaa.length,
        wwwCaaIssuers: wwwCaa.map((record) => {
          if (record.issue) return `issue=${record.issue}`;
          if (record.issuewild) return `issuewild=${record.issuewild}`;
          return `${record.tag}=${record.value}`;
        }),
        mx: mx.map((record) => `${record.priority} ${record.exchange}`),
        apexCertificate: {
          issuer: apexCert.issuer.O,
          valid_to: apexCert.valid_to,
        },
        wwwCertificate: {
          issuer: wwwCert.issuer.O,
          valid_to: wwwCert.valid_to,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
