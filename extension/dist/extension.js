var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/security/secretScanner.js
var require_secretScanner = __commonJS({
  "src/security/secretScanner.js"(exports2, module2) {
    var SECRET_PATTERNS = [
      { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g },
      { name: "AWS Secret Key", regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g },
      { name: "Generic API Key", regex: /(?:api[_-]?key|apikey)["']?\s*[:=]\s*["']([A-Za-z0-9\-_]{16,})["']/gi },
      { name: "Private Key Block", regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
      { name: "Slack Token", regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
      { name: "GitHub Token", regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
      { name: "JWT", regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
      { name: "Connection String", regex: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi }
    ];
    var SHANNON_ENTROPY_THRESHOLD = 4;
    var MIN_TOKEN_LENGTH = 20;
    function shannonEntropy(str) {
      const freq = /* @__PURE__ */ new Map();
      for (const char of str) {
        freq.set(char, (freq.get(char) || 0) + 1);
      }
      let entropy = 0;
      for (const count of freq.values()) {
        const p = count / str.length;
        entropy -= p * Math.log2(p);
      }
      return entropy;
    }
    function scanAndRedact(code) {
      let redactedCode = code;
      const findings = [];
      for (const { name, regex } of SECRET_PATTERNS) {
        const matches = redactedCode.match(regex);
        if (matches && matches.length > 0) {
          findings.push({ name, count: matches.length });
          redactedCode = redactedCode.replace(regex, "[REDACTED_SECRET]");
        }
      }
      const tokenCandidates = redactedCode.match(/[A-Za-z0-9+/_-]{20,}/g) || [];
      let entropyHits = 0;
      for (const token of tokenCandidates) {
        if (token.length >= MIN_TOKEN_LENGTH && shannonEntropy(token) >= SHANNON_ENTROPY_THRESHOLD) {
          redactedCode = redactedCode.replace(token, "[REDACTED_HIGH_ENTROPY]");
          entropyHits += 1;
        }
      }
      if (entropyHits > 0) {
        findings.push({ name: "High-entropy token", count: entropyHits });
      }
      return {
        redactedCode,
        findings,
        hasSecrets: findings.length > 0
      };
    }
    module2.exports = { scanAndRedact, SECRET_PATTERNS };
  }
});

// src/providers/diagnosticsProvider.js
var require_diagnosticsProvider = __commonJS({
  "src/providers/diagnosticsProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var { scanAndRedact } = require_secretScanner();
    var DEBOUNCE_MS = 400;
    var MAX_CODE_LENGTH = 5e4;
    function cancellationTokenToAbortSignal(token) {
      const controller = new AbortController();
      if (token.isCancellationRequested) {
        controller.abort();
      } else {
        token.onCancellationRequested(() => controller.abort());
      }
      return controller.signal;
    }
    function registerDiagnosticsProvider2(context, apiClient) {
      const diagnosticCollection = vscode2.languages.createDiagnosticCollection("susie");
      let debounceTimer;
      let activeCancellation;
      async function analyzeDocument(document) {
        if (document.getText().length === 0 || document.getText().length > MAX_CODE_LENGTH) {
          return;
        }
        activeCancellation?.cancel();
        activeCancellation = new vscode2.CancellationTokenSource();
        const signal = cancellationTokenToAbortSignal(activeCancellation.token);
        const { redactedCode, hasSecrets } = scanAndRedact(document.getText());
        if (hasSecrets) {
          vscode2.window.setStatusBarMessage("Mistral Assistant: secrets redacted before analysis", 3e3);
        }
        try {
          const result = await apiClient.codeBreakdown(redactedCode, document.languageId, signal);
          if (activeCancellation.token.isCancellationRequested) {
            return;
          }
          applyDiagnostics(document, result);
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("[mistral-assistant] diagnostics failed:", err.message);
          }
        }
      }
      function applyDiagnostics(document, result) {
        const severityMap = {
          error: vscode2.DiagnosticSeverity.Error,
          warning: vscode2.DiagnosticSeverity.Warning,
          info: vscode2.DiagnosticSeverity.Information
        };
        const diagnostics = (result.issues || []).map((issue) => {
          const line = document.lineAt(Math.min(issue.line, document.lineCount - 1));
          const range = new vscode2.Range(line.range.start, line.range.end);
          return new vscode2.Diagnostic(range, issue.message, severityMap[issue.severity] ?? vscode2.DiagnosticSeverity.Information);
        });
        diagnosticCollection.set(document.uri, diagnostics);
      }
      function scheduleAnalysis(document) {
        if (document.languageId === "plaintext" || document.uri.scheme !== "file") {
          return;
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => analyzeDocument(document), DEBOUNCE_MS);
      }
      const changeSub = vscode2.workspace.onDidChangeTextDocument((event) => scheduleAnalysis(event.document));
      const openSub = vscode2.workspace.onDidOpenTextDocument((document) => scheduleAnalysis(document));
      const closeSub = vscode2.workspace.onDidCloseTextDocument((document) => diagnosticCollection.delete(document.uri));
      return new vscode2.Disposable(() => {
        clearTimeout(debounceTimer);
        activeCancellation?.cancel();
        diagnosticCollection.dispose();
        changeSub.dispose();
        openSub.dispose();
        closeSub.dispose();
      });
    }
    module2.exports = { registerDiagnosticsProvider: registerDiagnosticsProvider2, cancellationTokenToAbortSignal };
  }
});

// src/providers/codeActionProvider.js
var require_codeActionProvider = __commonJS({
  "src/providers/codeActionProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var { scanAndRedact } = require_secretScanner();
    var { cancellationTokenToAbortSignal } = require_diagnosticsProvider();
    var CodeCorrectionActionProvider = class {
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
        if (context.diagnostics.some((d) => d.source === "susie" || true)) {
          const fixAction = new vscode2.CodeAction("Fix with Susie Assistant", vscode2.CodeActionKind.QuickFix);
          fixAction.command = {
            command: "susie.applyCorrection",
            title: "Fix with Susie Assistant",
            arguments: [document, range]
          };
          actions.push(fixAction);
        }
        return actions;
      }
    };
    function registerCodeActionProvider2(context, apiClient) {
      const provider = vscode2.languages.registerCodeActionsProvider(
        { scheme: "file" },
        new CodeCorrectionActionProvider(apiClient),
        { providedCodeActionKinds: [vscode2.CodeActionKind.QuickFix] }
      );
      const commandDisposable = vscode2.commands.registerCommand(
        "susie.applyCorrection",
        /**
         * @param {vscode.TextDocument} document
         * @param {vscode.Range} range
         */
        async (document, range) => {
          const editor = vscode2.window.visibleTextEditors.find((e) => e.document.uri.toString() === document.uri.toString());
          if (!editor) return;
          let effectiveRange = range;
          if (range.isEmpty) {
            effectiveRange = document.lineAt(range.start.line).range;
          }
          const originalText = document.getText(effectiveRange);
          if (!originalText.trim()) {
            vscode2.window.showWarningMessage(
              "Nothing to correct \u2014 select some code or place your cursor on a non-empty line."
            );
            return;
          }
          const cancellationSource = new vscode2.CancellationTokenSource();
          const signal = cancellationTokenToAbortSignal(cancellationSource.token);
          const { redactedCode, hasSecrets } = scanAndRedact(originalText);
          if (!redactedCode || !redactedCode.trim()) {
            vscode2.window.showWarningMessage("Nothing left to send after redacting secrets from this selection.");
            cancellationSource.cancel();
            return;
          }
          if (hasSecrets) {
            const proceed = await vscode2.window.showWarningMessage(
              "Detected potential secrets in this selection. They have been redacted before sending. Continue?",
              "Continue",
              "Cancel"
            );
            if (proceed !== "Continue") {
              cancellationSource.cancel();
              return;
            }
          }
          try {
            const result = await vscode2.window.withProgress(
              { location: vscode2.ProgressLocation.Notification, title: "Requesting correction from Mistral...", cancellable: true },
              async (_progress, progressToken) => {
                progressToken.onCancellationRequested(() => cancellationSource.cancel());
                return apiClient.codeCorrection(redactedCode, document.languageId, signal);
              }
            );
            await editor.edit((editBuilder) => {
              editBuilder.replace(effectiveRange, result.correctedCode);
            });
          } catch (err) {
            if (err.name !== "AbortError") {
              vscode2.window.showErrorMessage(`Correction failed: ${err.message}`);
            }
          }
        }
      );
      return new vscode2.Disposable(() => {
        provider.dispose();
        commandDisposable.dispose();
      });
    }
    module2.exports = { registerCodeActionProvider: registerCodeActionProvider2, CodeCorrectionActionProvider };
  }
});

// src/providers/chatViewProvider.js
var require_chatViewProvider = __commonJS({
  "src/providers/chatViewProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var VIEW_TYPE = "susie.chatView";
    var ChatViewProvider = class {
      /**
       * @param {vscode.Uri} extensionUri
       * @param {import('../client/apiClient').ApiClient} apiClient
       */
      constructor(extensionUri, apiClient) {
        this.extensionUri = extensionUri;
        this.apiClient = apiClient;
        this.history = [];
      }
      /**
       * @param {vscode.WebviewView} webviewView
       */
      resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(async (message) => {
          if (message.type !== "userMessage") return;
          this.history.push({ role: "user", content: message.text });
          this.postToWebview({ type: "appendMessage", role: "user", text: message.text });
          const cancellationSource = new vscode2.CancellationTokenSource();
          const controller = new AbortController();
          cancellationSource.token.onCancellationRequested(() => controller.abort());
          try {
            this.postToWebview({ type: "setLoading", loading: true });
            const result = await this.apiClient.chat(this.history, controller.signal);
            this.history.push({ role: "assistant", content: result.reply });
            this.postToWebview({ type: "appendMessage", role: "assistant", text: result.reply });
          } catch (err) {
            this.postToWebview({ type: "appendMessage", role: "assistant", text: `Error: ${err.message}` });
          } finally {
            this.postToWebview({ type: "setLoading", loading: false });
          }
        });
      }
      /**
       * @param {object} message
       */
      postToWebview(message) {
        this.view?.webview.postMessage(message);
      }
      getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
    #messages { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .msg { padding: 6px 10px; border-radius: 6px; max-width: 90%; white-space: pre-wrap; }
    .user { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .assistant { align-self: flex-start; background: var(--vscode-editorWidget-background); }
    #inputRow { display: flex; gap: 4px; }
    #input { flex: 1; }
    #loading { font-style: italic; opacity: 0.7; display: none; }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="loading">Thinking...</div>
  <div id="inputRow">
    <input id="input" type="text" placeholder="Ask about your code..." />
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const loadingEl = document.getElementById('loading');

    document.getElementById('send').addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'userMessage', text });
      inputEl.value = '';
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'appendMessage') {
        const div = document.createElement('div');
        div.className = 'msg ' + message.role;
        div.textContent = message.text;
        messagesEl.appendChild(div);
        div.scrollIntoView();
      } else if (message.type === 'setLoading') {
        loadingEl.style.display = message.loading ? 'block' : 'none';
      }
    });
  </script>
</body>
</html>`;
      }
    };
    function registerChatViewProvider2(context, apiClient) {
      const provider = new ChatViewProvider(context.extensionUri, apiClient);
      return vscode2.window.registerWebviewViewProvider(VIEW_TYPE, provider);
    }
    module2.exports = { registerChatViewProvider: registerChatViewProvider2, ChatViewProvider, VIEW_TYPE };
  }
});

// src/auth/secretStorage.js
var require_secretStorage = __commonJS({
  "src/auth/secretStorage.js"(exports2, module2) {
    var crypto = require("crypto");
    var TOKEN_KEY = "susie.installToken";
    async function getOrCreateInstallToken2(context) {
      const existing = await context.secrets.get(TOKEN_KEY);
      if (existing) {
        return existing;
      }
      const token = crypto.randomBytes(32).toString("hex");
      await context.secrets.store(TOKEN_KEY, token);
      return token;
    }
    module2.exports = { getOrCreateInstallToken: getOrCreateInstallToken2, TOKEN_KEY };
  }
});

// src/client/apiClient.js
var require_apiClient = __commonJS({
  "src/client/apiClient.js"(exports2, module2) {
    var ApiClient2 = class {
      /**
       * @param {{ baseUrl: string, installToken: string, timeoutMs?: number, maxRetries?: number }} options
       */
      constructor({ baseUrl, installToken, timeoutMs = 15e3, maxRetries = 2 }) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.installToken = installToken;
        this.timeoutMs = timeoutMs;
        this.maxRetries = maxRetries;
      }
      /**
       * @param {string} token
       */
      setInstallToken(token) {
        this.installToken = token;
      }
      /**
       * Parses a backend error response into a clear, user-facing message.
       * Falls back gracefully if the body isn't the structured JSON we expect.
       *
       * @param {number} status
       * @param {string} rawBody
       * @returns {Error}
       */
      parseErrorBody(status, rawBody) {
        let parsed;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          parsed = null;
        }
        if (parsed?.error === "AI_PROVIDER_ERROR") {
          const err2 = new Error("The AI provider is temporarily unavailable. Please try again in a moment.");
          err2.code = "AI_PROVIDER_ERROR";
          err2.status = status;
          return err2;
        }
        if (parsed?.message) {
          const err2 = new Error(parsed.message);
          err2.code = parsed.code ?? parsed.error;
          err2.status = status;
          return err2;
        }
        const err = new Error(`Backend error ${status}: ${rawBody || "no response body"}`);
        err.status = status;
        return err;
      }
      /**
       * @param {number} status
       * @returns {boolean}
       */
      isRetryableStatus(status) {
        return status === 502 || status === 503 || status === 504;
      }
      /**
       * @param {string} path
       * @param {object} body
       * @param {AbortSignal} [externalSignal]
       * @returns {Promise<any>}
       */
      async post(path, body, externalSignal) {
        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
          if (externalSignal?.aborted) {
            throw new Error("Cancelled by caller");
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), this.timeoutMs);
          const onExternalAbort = () => controller.abort(new Error("Cancelled by caller"));
          if (externalSignal) {
            externalSignal.addEventListener("abort", onExternalAbort);
          }
          try {
            const response = await fetch(`${this.baseUrl}${path}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.installToken}`
              },
              body: JSON.stringify(body),
              signal: controller.signal
            });
            if (!response.ok) {
              const errorBody = await response.text().catch(() => "");
              const err = this.parseErrorBody(response.status, errorBody);
              if (this.isRetryableStatus(response.status) && attempt < this.maxRetries) {
                lastError = err;
                const backoffMs = 500 * 2 ** attempt;
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
                continue;
              }
              throw err;
            }
            return await response.json();
          } catch (err) {
            if (err.name === "AbortError") {
              throw err;
            }
            if (attempt >= this.maxRetries) {
              throw err;
            }
            lastError = err;
          } finally {
            clearTimeout(timeout);
            if (externalSignal) {
              externalSignal.removeEventListener("abort", onExternalAbort);
            }
          }
        }
        throw lastError;
      }
      /**
       * @param {string} code
       * @param {string} language
       * @param {AbortSignal} [signal]
       */
      codeBreakdown(code, language, signal) {
        return this.post("/api/code-breakdown", { code, language }, signal);
      }
      /**
       * @param {string} code
       * @param {string} language
       * @param {AbortSignal} [signal]
       */
      codeCorrection(code, language, signal) {
        return this.post("/api/code-correction", { code, language }, signal);
      }
      /**
       * @param {string} codePrefix
       * @param {string} language
       * @param {AbortSignal} [signal]
       */
      autocomplete(codePrefix, language, signal) {
        return this.post("/api/autocomplete", { codePrefix, language }, signal);
      }
      /**
       * @param {{ role: 'user' | 'assistant', content: string }[]} messages
       * @param {AbortSignal} [signal]
       */
      chat(messages, signal) {
        return this.post("/api/chatbot", { messages }, signal);
      }
    };
    module2.exports = { ApiClient: ApiClient2 };
  }
});

// src/extension.js
var vscode = require("vscode");
var { registerDiagnosticsProvider } = require_diagnosticsProvider();
var { registerCodeActionProvider } = require_codeActionProvider();
var { registerChatViewProvider } = require_chatViewProvider();
var { getOrCreateInstallToken } = require_secretStorage();
var { ApiClient } = require_apiClient();
async function activate(context) {
  const config = vscode.workspace.getConfiguration("susie");
  const baseUrl = config.get("serverUrl", "http://127.0.0.1:3000");
  const installToken = await getOrCreateInstallToken(context);
  console.log("[DEBUG] install token:", installToken);
  const apiClient = new ApiClient({ baseUrl, installToken });
  const diagnosticsDisposable = registerDiagnosticsProvider(context, apiClient);
  const codeActionDisposable = registerCodeActionProvider(context, apiClient);
  const chatViewDisposable = registerChatViewProvider(context, apiClient);
  context.subscriptions.push(diagnosticsDisposable, codeActionDisposable, chatViewDisposable);
  context.subscriptions.push(
    vscode.commands.registerCommand("susie.rotateToken", async () => {
      await context.secrets.delete("susie.installToken");
      const newToken = await getOrCreateInstallToken(context);
      apiClient.setInstallToken(newToken);
      vscode.window.showInformationMessage("Install token rotated.");
    })
  );
  console.log("[mistral-assistant] activated");
}
function deactivate() {
}
module.exports = { activate, deactivate };
