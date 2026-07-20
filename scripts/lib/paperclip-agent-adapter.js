function buildAdapterSignature(adapterType, adapterConfig) {
  return JSON.stringify({
    adapterType: adapterType || null,
    adapterConfig: adapterConfig || {},
  });
}

module.exports = {
  buildAdapterSignature,
};
