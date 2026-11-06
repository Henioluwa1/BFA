const fs = require('fs');

/**
 * Build mysql2 TLS options. CA validation is mandatory whenever DB_TLS is enabled.
 * @param {{ enabled: boolean, ca?: string, caPath?: string }} tlsConfig
 * @param {object} fileSystem
 * @returns {object|undefined}
 */
function getTlsOptions(tlsConfig, fileSystem = fs) {
  if (!tlsConfig.enabled) return undefined;

  let ca = tlsConfig.ca;
  if (!ca && tlsConfig.caPath) {
    try {
      ca = fileSystem.readFileSync(tlsConfig.caPath, 'utf8');
    } catch (error) {
      throw new Error(`Database TLS is enabled but DB_TLS_CA_PATH could not be read: ${error.message}`);
    }
  }

  if (!ca || !ca.trim()) {
    throw new Error('Database TLS is enabled but no CA certificate is configured. Set DB_TLS_CA or DB_TLS_CA_PATH.');
  }

  return { ssl: { ca, rejectUnauthorized: true } };
}

module.exports = { getTlsOptions };
