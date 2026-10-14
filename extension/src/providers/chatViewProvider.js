const vscode = require('vscode');

const VIEW_TYPE = 'susie.chatView';

class ChatViewProvider {
  /**
   * @param {vscode.Uri} extensionUri
   * @param {import('../client/apiClient').ApiClient} apiClient
   */
  constructor(extensionUri, apiClient) {
    this.extensionUri = extensionUri;
    this.apiClient = apiClient;
    /** @type {{ role: 'user' | 'assistant', content: string }[]} */
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
      if (message.type !== 'userMessage') return;

      this.history.push({ role: 'user', content: message.text });
      this.postToWebview({ type: 'appendMessage', role: 'user', text: message.text });

      const cancellationSource = new vscode.CancellationTokenSource();
      const controller = new AbortController();
      cancellationSource.token.onCancellationRequested(() => controller.abort());

      try {
        this.postToWebview({ type: 'setLoading', loading: true });
        const result = await this.apiClient.chat(this.history, controller.signal);
        this.history.push({ role: 'assistant', content: result.reply });
        this.postToWebview({ type: 'appendMessage', role: 'assistant', text: result.reply });
      } catch (err) {
        this.postToWebview({ type: 'appendMessage', role: 'assistant', text: `Error: ${err.message}` });
      } finally {
        this.postToWebview({ type: 'setLoading', loading: false });
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
    // Inline HTML/CSS/JS — no external resources needed for a minimal chat UI.
    // Content-Security-Policy restricts scripts to this document only.
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
}

/**
 * @param {import('vscode').ExtensionContext} context
 * @param {import('../client/apiClient').ApiClient} apiClient
 * @returns {vscode.Disposable}
 */
function registerChatViewProvider(context, apiClient) {
  const provider = new ChatViewProvider(context.extensionUri, apiClient);
  return vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider);
}

module.exports = { registerChatViewProvider, ChatViewProvider, VIEW_TYPE };
