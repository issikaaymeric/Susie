const vscode = require('vscode');
const { registerDiagnosticsProvider } = require('./providers/diagnosticsProvider');
const { registerCodeActionProvider } = require('./providers/codeActionProvider');
const { registerChatViewProvider } = require('./providers/chatViewProvider');
const { ApiClient } = require('./client/apiClient');

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    const config = vscode.workspace.getConfiguration('susie');
    const baseUrl = config.get('serverUrl', 'https://susie-w9xo.onrender.com');

    const installToken = config.get('installToken', '');

    const apiClient = new ApiClient({
        baseUrl,
        installToken,
    });

    context.subscriptions.push(
        registerDiagnosticsProvider(context, apiClient),
        registerCodeActionProvider(context, apiClient),
        registerChatViewProvider(context, apiClient)
    );

    console.log('[Susie] Extension activated.');
}

function deactivate() {}

module.exports = {
    activate,
    deactivate,
};