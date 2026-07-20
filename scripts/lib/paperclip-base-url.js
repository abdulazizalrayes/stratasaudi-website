const DEFAULT_CLOUD_BASE_URL = "https://ai.eijarat.com";

function getPaperclipBaseUrl() {
  return (
    process.env.PAPERCLIP_API_URL ||
    process.env.PAPERCLIP_API_BASE_URL ||
    process.env.PAPERCLIP_BASE_URL ||
    DEFAULT_CLOUD_BASE_URL
  );
}

module.exports = {
  DEFAULT_CLOUD_BASE_URL,
  getPaperclipBaseUrl,
};
