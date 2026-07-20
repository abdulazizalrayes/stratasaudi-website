const https = require("https");
const {
  PAGE_SEO_ROUTES,
  publicUrlForRoute,
} = require("../lib/page-renderer");

const DEFAULT_HOST = "www.stratasaudi.com";
const DEFAULT_KEY = "0957b4b1b950a90f9ac51a5a737203ec";
const DEFAULT_KEY_LOCATION = `https://${DEFAULT_HOST}/${DEFAULT_KEY}.txt`;

const liveUrls = PAGE_SEO_ROUTES.flatMap((page) =>
  [publicUrlForRoute(page.path, "en")],
);

function submitIndexNow(urlList) {
  const payload = JSON.stringify({
    host: DEFAULT_HOST,
    key: DEFAULT_KEY,
    keyLocation: DEFAULT_KEY_LOCATION,
    urlList,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://api.indexnow.org/indexnow",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body,
          });
        });
      },
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const argUrls = process.argv.slice(2).filter(Boolean);
  const urlList = argUrls.length ? argUrls : liveUrls;
  const result = await submitIndexNow(urlList);
  console.log(
    JSON.stringify(
      {
        submitted: urlList,
        statusCode: result.statusCode,
        body: result.body,
      },
      null,
      2,
    ),
  );

  if (!result.statusCode || result.statusCode >= 300) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
