const DEFAULT_CLOUD_BASE_URL = "https://ai.eijarat.com";

function getPaperclipBaseUrl() {
  const configured =
    process.env.PAPERCLIP_API_URL ||
    process.env.PAPERCLIP_API_BASE_URL ||
    process.env.PAPERCLIP_BASE_URL ||
    DEFAULT_CLOUD_BASE_URL;
  let parsed;
  try {
    parsed = new URL(configured);
  } catch (_error) {
    throw new Error("Paperclip URL must be the approved Strata cloud origin.");
  }
  if (
    parsed.origin !== DEFAULT_CLOUD_BASE_URL ||
    !["", "/"].includes(parsed.pathname) ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Paperclip URL must be https://ai.eijarat.com.");
  }
  return DEFAULT_CLOUD_BASE_URL;
}

module.exports = {
  DEFAULT_CLOUD_BASE_URL,
  getPaperclipBaseUrl,
};
