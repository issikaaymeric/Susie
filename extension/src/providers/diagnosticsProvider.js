const vscode = require('vscode');
const { scanAndRedact } = require('../security/secretScanner');

const DEBOUNCE_MS = 400;
const MAX_CODE_LENGTH = 50000;

/**
 * Bridges a vscode.CancellationToken to a standard AbortSignal so the
 * ApiClient (which only knows fetch/AbortController) can be cancelled
 * using VS Code's native cancellation mechanism.
 *
 * @param {vscode.CancellationToken} token
 * @returns {AbortSignal}
 */
function cancellationTokenToAbortSignal(token) {
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  } else {
    token.onCancellationRequested(() => controller.abort());
  }
  return controller.signal;
}

/**
 * @param {import('vscode').ExtensionContext} context
 * @param {import('../client/apiClient').ApiClient} apiClient
 * @returns {vscode.Disposable}
 */
function registerDiagnosticsProvider(context, apiClient) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('susie');

  /** @type {NodeJS.Timeout | undefined} */
  let debounceTimer;
  /** @type {vscode.CancellationTokenSource | undefined} */
  let activeCancellation;

  /**
   * @param {vscode.TextDocument} document
   */
  async function analyzeDocument(document) {
    if (document.getText().length === 0 || document.getText().length > MAX_CODE_LENGTH) {
      return;
    }

    // Cancel any in-flight analysis for this document before starting a new one —
    // prevents a backlog of stale requests when the user types quickly.
    activeCancellation?.cancel();
    activeCancellation = new vscode.CancellationTokenSource();
    const signal = cancellationTokenToAbortSignal(activeCancellation.token);

    const { redactedCode, hasSecrets } = scanAndRedact(document.getText());
    if (hasSecrets) {
      vscode.window.setStatusBarMessage('Mistral Assistant: secrets redacted before analysis', 3000);
    }

    try {
      const result = await apiClient.codeBreakdown(redactedCode, document.languageId, signal);
      if (activeCancellation.token.isCancellationRequested) {
        return; // A newer keystroke superseded this request; drop the stale result.
      }
      applyDiagnostics(document, result);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[mistral-assistant] diagnostics failed:', err.message);
      }
    }
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {{ issues: { line: number, message: string, severity: 'error' | 'warning' | 'info' }[] }} result
   */
  function applyDiagnostics(document, result) {
    const severityMap = {
      error: vscode.DiagnosticSeverity.Error,
      warning: vscode.DiagnosticSeverity.Warning,
      info: vscode.DiagnosticSeverity.Information,
    };

    const diagnostics = (result.issues || []).map((issue) => {
      const line = document.lineAt(Math.min(issue.line, document.lineCount - 1));
      const range = new vscode.Range(line.range.start, line.range.end);
      return new vscode.Diagnostic(range, issue.message, severityMap[issue.severity] ?? vscode.DiagnosticSeverity.Information);
    });

    diagnosticCollection.set(document.uri, diagnostics);
  }

  function scheduleAnalysis(document) {
    if (document.languageId === 'plaintext' || document.uri.scheme !== 'file') {
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => analyzeDocument(document), DEBOUNCE_MS);
  }

  const changeSub = vscode.workspace.onDidChangeTextDocument((event) => scheduleAnalysis(event.document));
  const openSub = vscode.workspace.onDidOpenTextDocument((document) => scheduleAnalysis(document));
  const closeSub = vscode.workspace.onDidCloseTextDocument((document) => diagnosticCollection.delete(document.uri));

  return new vscode.Disposable(() => {
    clearTimeout(debounceTimer);
    activeCancellation?.cancel();
    diagnosticCollection.dispose();
    changeSub.dispose();
    openSub.dispose();
    closeSub.dispose();
  });
}

module.exports = { registerDiagnosticsProvider, cancellationTokenToAbortSignal };
