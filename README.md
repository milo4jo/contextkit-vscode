# ContextKit for VS Code

> Smart context selection for AI coding assistants

Find the right code for your AI prompts — without pasting your entire codebase.

## Features

### 🔍 Find Relevant Code
`Cmd/Ctrl+Shift+P` → "ContextKit: Find Relevant Code"

Enter a natural language query like "how does authentication work" and get the most relevant code snippets.

### 📋 Find Related Code (Right-Click)
Select code in your editor, right-click → "ContextKit: Find Related Code"

Instantly find code related to your selection.

### 📊 Auto-Indexing
ContextKit automatically indexes your workspace on open. Incremental updates keep the index fresh.

## Requirements

- [ContextKit CLI](https://github.com/milo4jo/contextkit) must be installed:
  ```bash
  npm install -g @milo4jo/contextkit
  ```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `contextkit.defaultBudget` | 8000 | Default token budget for context selection |
| `contextkit.autoIndex` | true | Automatically index workspace on open |
| `contextkit.cliPath` | contextkit | Path to contextkit CLI |

## Commands

| Command | Description |
|---------|-------------|
| ContextKit: Find Relevant Code | Search for code by natural language query |
| ContextKit: Find Related Code | Find code related to selection |
| ContextKit: Index Workspace | Re-index the workspace |
| ContextKit: Show Status | Show indexing status |

## How It Works

1. **Indexes your codebase** — Breaks code into semantic chunks
2. **Creates embeddings** — Converts code to vectors (locally, no API)
3. **Semantic search** — Finds code by meaning, not just keywords
4. **Copies to clipboard** — Ready to paste into Claude, ChatGPT, etc.

## Links

- [ContextKit CLI](https://github.com/milo4jo/contextkit)
- [Documentation](https://contextkit-site.vercel.app)
- [Report Issues](https://github.com/milo4jo/contextkit-vscode/issues)

---

Built by [Milo](https://milo-site-self.vercel.app) 🦊
