import * as vscode from 'vscode';
import { spawn } from 'child_process';

let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let isIndexing = false;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('ContextKit');
  
  // Minimal status bar - only shows during operations
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'contextkit.showStatus';
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('contextkit.selectContext', selectContext),
    vscode.commands.registerCommand('contextkit.selectContextFromSelection', selectContextFromSelection),
    vscode.commands.registerCommand('contextkit.findSymbol', findSymbol),
    vscode.commands.registerCommand('contextkit.showCallGraph', showCallGraph),
    vscode.commands.registerCommand('contextkit.getCodebaseMap', getCodebaseMap),
    vscode.commands.registerCommand('contextkit.indexWorkspace', indexWorkspace),
    vscode.commands.registerCommand('contextkit.showStatus', showStatus)
  );

  // Auto-index on startup if enabled (disabled by default for minimal UX)
  const config = vscode.workspace.getConfiguration('contextkit');
  if (config.get('autoIndex')) {
    silentCheckAndIndex();
  }
}

async function getCliPath(): Promise<string> {
  const config = vscode.workspace.getConfiguration('contextkit');
  const cliPath = config.get<string>('cliPath') || 'contextkit';
  
  if (/[;&|`$]/.test(cliPath)) {
    throw new Error('Invalid CLI path');
  }
  
  return cliPath;
}

async function getWorkspacePath(): Promise<string | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  return workspaceFolders[0].uri.fsPath;
}

async function runContextKit(args: string[], cwd: string): Promise<string> {
  const cli = await getCliPath();
  
  return new Promise((resolve, reject) => {
    const proc = spawn(cli, args, { 
      cwd, 
      shell: false,
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Exit code ${code}`));
      }
    });
    
    proc.on('error', (error: Error) => {
      reject(error);
    });
  });
}

function showStatusBar(text: string, tooltip?: string) {
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip || 'ContextKit';
  statusBarItem.show();
}

function hideStatusBar() {
  statusBarItem.hide();
}

function notify(message: string) {
  const config = vscode.workspace.getConfiguration('contextkit');
  if (config.get('showNotifications')) {
    vscode.window.showInformationMessage(message);
  }
}

async function selectContext() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showWarningMessage('Open a folder first');
    return;
  }

  // Quick input with placeholder
  const query = await vscode.window.showInputBox({
    prompt: 'What are you looking for?',
    placeHolder: 'e.g., authentication flow, API routes, error handling...',
    ignoreFocusOut: true
  });

  if (!query?.trim()) return;

  const config = vscode.workspace.getConfiguration('contextkit');
  const budget = config.get('defaultBudget') || 8000;

  showStatusBar('$(sync~spin) Finding...', 'Searching for relevant code');

  try {
    const result = await runContextKit(
      ['select', query.trim(), '--budget', String(budget), '--format', 'markdown'],
      workspacePath
    );

    if (!result.trim()) {
      hideStatusBar();
      vscode.window.showWarningMessage('No relevant code found. Try indexing first.');
      return;
    }

    // Show in new document
    const doc = await vscode.workspace.openTextDocument({
      content: result,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    
    // Copy to clipboard
    await vscode.env.clipboard.writeText(result);
    
    hideStatusBar();
    notify('Context copied to clipboard');
    
  } catch (error) {
    hideStatusBar();
    handleError(error, workspacePath);
  }
}

async function selectContextFromSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.document.getText(editor.selection);
  if (!selection?.trim()) {
    vscode.window.showWarningMessage('Select some code first');
    return;
  }

  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  const config = vscode.workspace.getConfiguration('contextkit');
  const budget = config.get('defaultBudget') || 8000;

  showStatusBar('$(sync~spin) Finding...', 'Finding related code');

  try {
    const query = selection.slice(0, 500).trim();
    
    const result = await runContextKit(
      ['select', `Related to: ${query}`, '--budget', String(budget), '--format', 'markdown'],
      workspacePath
    );

    if (!result.trim()) {
      hideStatusBar();
      vscode.window.showWarningMessage('No related code found');
      return;
    }

    const doc = await vscode.workspace.openTextDocument({
      content: result,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { 
      preview: true, 
      viewColumn: vscode.ViewColumn.Beside 
    });
    
    await vscode.env.clipboard.writeText(result);
    
    hideStatusBar();
    notify('Related code copied to clipboard');
    
  } catch (error) {
    hideStatusBar();
    handleError(error, workspacePath);
  }
}

async function indexWorkspace() {
  if (isIndexing) {
    vscode.window.showInformationMessage('Indexing already in progress...');
    return;
  }

  const workspacePath = await getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showWarningMessage('Open a folder first');
    return;
  }

  isIndexing = true;
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'ContextKit',
    cancellable: false
  }, async (progress) => {
    try {
      // Check if initialized
      progress.report({ message: 'Checking setup...' });
      
      try {
        await runContextKit(['doctor', '--json'], workspacePath);
      } catch {
        // Not initialized
        progress.report({ message: 'Initializing...' });
        await runContextKit(['init'], workspacePath);
        
        // Add source
        const srcExists = await vscode.workspace.fs.stat(
          vscode.Uri.file(`${workspacePath}/src`)
        ).then(() => true, () => false);
        
        await runContextKit(
          ['source', 'add', srcExists ? './src' : '.'],
          workspacePath
        );
      }

      // Index
      progress.report({ message: 'Indexing files...' });
      await runContextKit(['index'], workspacePath);

      vscode.window.showInformationMessage('Indexing complete ✓');
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Indexing failed: ${msg}`);
    } finally {
      isIndexing = false;
    }
  });
}

async function silentCheckAndIndex() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  try {
    await runContextKit(['doctor', '--json'], workspacePath);
  } catch {
    // Silently prompt to index
    const action = await vscode.window.showInformationMessage(
      'ContextKit: Index this workspace for smart code search?',
      'Index Now',
      'Later'
    );
    if (action === 'Index Now') {
      await indexWorkspace();
    }
  }
}

async function findSymbol() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showWarningMessage('Open a folder first');
    return;
  }

  const symbolName = await vscode.window.showInputBox({
    prompt: 'Symbol name to search for',
    placeHolder: 'e.g., UserService, handleAuth, parseConfig...',
    ignoreFocusOut: true
  });

  if (!symbolName?.trim()) return;

  showStatusBar('$(sync~spin) Searching...', 'Finding symbols');

  try {
    const result = await runContextKit(
      ['symbol', symbolName.trim()],
      workspacePath
    );

    if (!result.trim()) {
      hideStatusBar();
      vscode.window.showWarningMessage(`No symbols found matching "${symbolName}"`);
      return;
    }

    const doc = await vscode.workspace.openTextDocument({
      content: result,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    
    await vscode.env.clipboard.writeText(result);
    hideStatusBar();
    notify('Symbol results copied to clipboard');
    
  } catch (error) {
    hideStatusBar();
    handleError(error, workspacePath);
  }
}

async function showCallGraph() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first');
    return;
  }

  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  // Try to get function name from cursor position or selection
  let functionName: string | undefined;
  
  const selection = editor.document.getText(editor.selection);
  if (selection?.trim()) {
    // Use selected text as function name
    functionName = selection.trim().split(/[\s(]/)[0];
  } else {
    // Ask for function name
    functionName = await vscode.window.showInputBox({
      prompt: 'Function name to analyze',
      placeHolder: 'e.g., handlePayment, validateUser...',
      ignoreFocusOut: true
    });
  }

  if (!functionName?.trim()) return;

  showStatusBar('$(sync~spin) Analyzing...', 'Building call graph');

  try {
    const result = await runContextKit(
      ['graph', functionName.trim()],
      workspacePath
    );

    if (!result.trim() || result.includes('No call relationships')) {
      hideStatusBar();
      vscode.window.showWarningMessage(`No call graph found for "${functionName}"`);
      return;
    }

    const doc = await vscode.workspace.openTextDocument({
      content: result,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    
    hideStatusBar();
    notify('Call graph generated');
    
  } catch (error) {
    hideStatusBar();
    handleError(error, workspacePath);
  }
}

async function getCodebaseMap() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showWarningMessage('Open a folder first');
    return;
  }

  const query = await vscode.window.showInputBox({
    prompt: 'What part of the codebase? (leave empty for full map)',
    placeHolder: 'e.g., authentication, API routes, or leave empty',
    ignoreFocusOut: true
  });

  showStatusBar('$(sync~spin) Mapping...', 'Generating codebase map');

  try {
    const args = query?.trim() 
      ? ['select', query.trim(), '--mode', 'map', '--budget', '16000']
      : ['select', 'codebase overview', '--mode', 'map', '--budget', '16000'];
    
    const result = await runContextKit(args, workspacePath);

    if (!result.trim()) {
      hideStatusBar();
      vscode.window.showWarningMessage('Could not generate map. Try indexing first.');
      return;
    }

    const doc = await vscode.workspace.openTextDocument({
      content: `# Codebase Map\n\n${result}`,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    
    await vscode.env.clipboard.writeText(result);
    hideStatusBar();
    notify('Codebase map copied to clipboard');
    
  } catch (error) {
    hideStatusBar();
    handleError(error, workspacePath);
  }
}

async function showStatus() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showWarningMessage('Open a folder first');
    return;
  }

  try {
    const result = await runContextKit(['doctor'], workspacePath);
    outputChannel.clear();
    outputChannel.appendLine('ContextKit Status\n' + '='.repeat(40) + '\n');
    outputChannel.appendLine(result);
    outputChannel.show();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'CLI not found';
    
    outputChannel.clear();
    outputChannel.appendLine('ContextKit Status\n' + '='.repeat(40) + '\n');
    outputChannel.appendLine('⚠️ ContextKit CLI not available\n');
    outputChannel.appendLine('Install with: npm install -g @milo4jo/contextkit');
    outputChannel.appendLine('\nError: ' + msg);
    outputChannel.show();
  }
}

function handleError(error: unknown, workspacePath: string) {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  
  if (msg.includes('not initialized') || msg.includes('ENOENT')) {
    vscode.window.showErrorMessage(
      'Workspace not indexed',
      'Index Now'
    ).then(action => {
      if (action === 'Index Now') {
        indexWorkspace();
      }
    });
  } else if (msg.includes('ENOENT') || msg.includes('not found')) {
    vscode.window.showErrorMessage(
      'ContextKit CLI not found. Install: npm i -g @milo4jo/contextkit'
    );
  } else {
    vscode.window.showErrorMessage(`ContextKit: ${msg}`);
  }
}

export function deactivate() {
  outputChannel?.dispose();
  statusBarItem?.dispose();
}
