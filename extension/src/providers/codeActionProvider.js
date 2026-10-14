const vscode = require('vscode');
const { scanAndRedact } = require('../security/secretScanner');
const { cancellationTokenToAbortSignal } = require('./diagnosticsProvider');

/**
 * Provides "Fix with Susie Assistant" quick actions on diagnostics produced by
 * diagnosticsProvider, and a standalone "Suggest correction" action on
 * any selection.
 */
class CodeCorrectionActionProvider {
  /**
   * @param {import('../client/apiClient').ApiClient} apiClient
   */
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.Range} range
   * @param {vscode.CodeActionContext} context
   * @returns {vscode.CodeAction[]}
   */
  provideCodeActions(document, range, context) {
    const actions = [];

    if (context.diagnostics.some((d) => d.source === 'susie' || true)) {
      const fixAction = new vscode.CodeAction('Fix with Susie Assistant', vscode.CodeActionKind.QuickFix);
      fixAction.command = {
        command: 'susie.applyCorrection',
        title: 'Fix with Susie Assistant',
        arguments: [document, range],
      };
      actions.push(fixAction);
    }

    return actions;
  }
}

/**
 * @param {import('vscode').ExtensionContext} context
 * @param {import('../client/apiClient').ApiClient} apiClient
 * @returns {vscode.Disposable}
 */
function registerCodeActionProvider(context, apiClient) {
  const provider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    new CodeCorrectionActionProvider(apiClient),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
  );

  const commandDisposable = vscode.commands.registerCommand(
    'susie.applyCorrection',
    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.Range} range
     */
    async (document, range) => {
      const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === document.uri.toString());
      if (!editor) return;

      // Diagnostics for things like "')' expected" are often reported as a
      // zero-length range (an insertion point). Expand to the full line so
      // we actually have code to send for correction.
      let effectiveRange = range;
      if (range.isEmpty) {
        effectiveRange = document.lineAt(range.start.line).range;
      }

      const originalText = document.getText(effectiveRange);
      if (!originalText.trim()) {
        vscode.window.showWarningMessage(
          'Nothing to correct — select some code or place your cursor on a non-empty line.'
        );
        return;
      }

      const cancellationSource = new vscode.CancellationTokenSource();
      const signal = cancellationTokenToAbortSignal(cancellationSource.token);

      const { redactedCode, hasSecrets } = scanAndRedact(originalText);

      if (!redactedCode || !redactedCode.trim()) {
        vscode.window.showWarningMessage('Nothing left to send after redacting secrets from this selection.');
        cancellationSource.cancel();
        return;
      }

      if (hasSecrets) {
        const proceed = await vscode.window.showWarningMessage(
          'Detected potential secrets in this selection. They have been redacted before sending. Continue?',
          'Continue',
          'Cancel'
        );
        if (proceed !== 'Continue') {
          cancellationSource.cancel();
          return;
        }
      }

      try {
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Requesting correction from Mistral...', cancellable: true },
          async (_progress, progressToken) => {
            progressToken.onCancellationRequested(() => cancellationSource.cancel());
            return apiClient.codeCorrection(redactedCode, document.languageId, signal);
          }
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(effectiveRange, result.correctedCode);
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          vscode.window.showErrorMessage(`Correction failed: ${err.message}`);
        }
      }
    }
  );

  return new vscode.Disposable(() => {
    provider.dispose();
    commandDisposable.dispose();
  });
}

module.exports = { registerCodeActionProvider, CodeCorrectionActionProvider };