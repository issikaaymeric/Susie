# Susie — DeepSeek-powered AI coding assistant

Susie is a VS Code extension backed by a Fastify server. Its AI coding features use the DeepSeek chat completions API; the extension communicates securely with the server using per-install authentication tokens and supports real-time notifications through WebSockets.

## Project Structure

```
susie/
├── server/       # Fastify API server
└── extension/    # VS Code extension
```

---

# Server Setup

## Installation

```bash
cd server
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Configure the required variables:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
KNOWN_INSTALL_TOKEN_HASHES=token_hash_1,token_hash_2
VALKEY_URL=redis://localhost:6379
```

Start the development server:

```bash
npm run dev
```

The server will be available at:

```
http://localhost:3000
```

Run tests:

```bash
npm test
```

## Requirements

Use Node.js 18 or newer (the server uses the built-in `fetch` API), and provide a valid DeepSeek API key.

The server requires a running Valkey/Redis instance for:

* caching
* publish/subscribe notifications
* long-running task updates

Default connection:

```
redis://localhost:6379
```

---

# VS Code Extension Setup

## Installation

```bash
cd extension
npm install
```

Build the extension:

```bash
npm run build
```

This bundles the extension using esbuild:

```
dist/extension.js
```

## Development

Launch the extension development environment:

1. Open the project in VS Code.
2. Press:

```
F5
```

3. A new Extension Development Host window will open.

## Package Extension

Create a VS Code installable package:

```bash
vsce package
```

This generates:

```
susie-x.x.x.vsix
```

You can install it manually in VS Code:

```
Extensions → Install from VSIX...
```

---

# Configuration

Configure the backend URL in VS Code settings (the setting name is retained for compatibility with existing installations):

```json
{
  "mistralAssistant.serverUrl": "http://localhost:3000"
}
```

For production deployments, point this to your hosted server URL.

---

# Authentication Flow

Susie uses a secure install-token authentication system.

## First Run

1. The extension activates.
2. A unique install token is generated.
3. The token is stored securely using VS Code `SecretStorage`.
4. Requests to the server include this token as a Bearer authentication header.

## Registering an Install

The server does not store raw tokens.

Instead:

1. The extension token is hashed using SHA-256.
2. The hash is registered in:

```env
KNOWN_INSTALL_TOKEN_HASHES
```

Example:

```env
KNOWN_INSTALL_TOKEN_HASHES=abc123hash,def456hash
```

For production, replace the environment variable approach with a database-backed install registry.

Recommended schema:

```
installs
├── id
├── token_hash
├── created_at
├── last_used_at
└── revoked_at
```

## Token Rotation

Users can regenerate their token anytime:

```
Command Palette
→ Mistral Assistant: Rotate Install Token
```

---

# Real-Time Notifications

The server supports real-time client updates using WebSockets.

Flow:

```
Long-running task
        |
        v
Fastify Server
        |
        v
Valkey Pub/Sub
        |
        v
WebSocket Connection
        |
        v
VS Code Extension
```

Notifications are isolated per installation using hashed install tokens.

---

# Production Checklist

Before deploying to production, consider:

## Database-backed Authentication

Replace:

```
KNOWN_INSTALL_TOKEN_HASHES
```

with a persistent database lookup.

The database should support:

* token creation
* token revocation
* last activity tracking
* audit history

---

## Rate Limiting

Add request protection using:

```
@fastify/rate-limit
```

Recommended strategy:

* limit by install token hash
* prevent abuse of AI endpoints
* protect expensive operations

---

## WebSocket Proxy Support

The notification system requires WebSocket upgrade support.

Ensure your reverse proxy or load balancer forwards:

```
Connection: Upgrade
Upgrade: websocket
```

Some hosting providers require explicit WebSocket configuration.

---

# Deployment

The server can be deployed on platforms supporting Node.js applications.

Required environment variables:

```env
DEEPSEEK_API_KEY=
KNOWN_INSTALL_TOKEN_HASHES=
VALKEY_URL=
```

After deployment:

1. Update `mistralAssistant.serverUrl` in VS Code.
2. Register production install tokens.
3. Verify WebSocket connectivity.

---

# License

Add your project license information here.
