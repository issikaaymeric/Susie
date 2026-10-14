const crypto = require('crypto');

const TOKEN_KEY = 'susie.installToken';

/**
 * Retrieves the existing install token from SecretStorage, or generates
 * and persists a new one on first activation. This token authenticates
 * the extension to the backend — it is NOT the Mistral API key, which
 * never leaves the server.
 *
 * @param {import('vscode').ExtensionContext} context
 * @returns {Promise<string>}
 */
async function getOrCreateInstallToken(context) {
  const existing = await context.secrets.get(TOKEN_KEY);
  if (existing) {
    return existing;
  }

  const token = crypto.randomBytes(32).toString('hex');
  await context.secrets.store(TOKEN_KEY, token);
  return token;
}

module.exports = { getOrCreateInstallToken, TOKEN_KEY };
