# ContextKit for VS Code

> Smart context selection for AI coding assistants

Find the right code context for any query — without leaving your editor.

## Features

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Find Context** | `Cmd+Shift+K` | Semantic search for relevant code |
| **Find Related** | `Cmd+Shift+L` | Find code related to selection |
| **Find Symbol** | `Cmd+Shift+;` | Search by function/class name |
| **Call Graph** | Command Palette | Show callers/callees |
| **Codebase Map** | Command Palette | Get structure overview |
| **Index Workspace** | Command Palette | Build/update index |

## Quick Start

1. Install the extension
2. Open Command Palette (`Cmd+Shift+P`)
3. Run "ContextKit: Index Workspace"
4. Use `Cmd+Shift+K` to search

## Requirements

- [ContextKit CLI](https://www.npmjs.com/package/@milo4jo/contextkit)

```bash
npm install -g @milo4jo/contextkit
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `contextkit.defaultBudget` | 8000 | Token limit for results |
| `contextkit.autoIndex` | false | Auto-index on open |
| `contextkit.cliPath` | contextkit | Path to CLI |
| `contextkit.showNotifications` | true | Show copy notifications |

## How It Works

1. ContextKit indexes your codebase locally (nothing leaves your machine)
2. When you search, it finds semantically relevant code chunks
3. Results are copied to clipboard — paste into Claude, GPT, or any LLM

## Links

- [ContextKit CLI](https://github.com/milo4jo/contextkit)
- [Documentation](https://contextkit-site.vercel.app/docs)
- [Report Issues](https://github.com/milo4jo/contextkit-vscode/issues)

---

Built by [Milo](https://github.com/milo4jo) 🦊
