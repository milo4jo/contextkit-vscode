import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('ContextKit');
  
  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'contextkit.showStatus';
  statusBarItem.text = '$(search) ContextKit';
  statusBarItem.tooltip = 'ContextKit: Click for status';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('contextkit.selectContext', selectContext),
    vscode.commands.registerCommand('contextkit.selectContextFromSelection', selectContextFromSelection),
    vscode.commands.registerCommand('contextkit.indexWorkspace', indexWorkspace),
    vscode.commands.registerCommand('contextkit.showStatus', showStatus)
  );

  // Auto-index on startup if enabled
  const config = vscode.workspace.getConfiguration('contextkit');
  if (config.get('autoIndex')) {
    checkAndIndex();
  }

  outputChannel.appendLine('ContextKit extension activated');
}

async function getCliPath(): Promise<string> {
  const config = vscode.workspace.getConfiguration('contextkit');
  return config.get('cliPath') || 'contextkit';
}

async function getWorkspacePath(): Promise<string | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('ContextKit: No workspace folder open');
    return undefined;
  }
  return workspaceFolders[0].uri.fsPath;
}

async function runContextKit(args: string[], cwd: string): Promise<string> {
  const cli = await getCliPath();
  const command = `${cli} ${args.join(' ')}`;
  
  outputChannel.appendLine(`Running: ${command}`);
  
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (stderr) {
      outputChannel.appendLine(`stderr: ${stderr}`);
    }
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    outputChannel.appendLine(`Error: ${message}`);
    throw error;
  }
}

async function selectContext() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  const query = await vscode.window.showInputBox({
    prompt: 'What code are you looking for?',
    placeHolder: 'e.g., "how does authentication work"'
  });

  if (!query) return;

  const config = vscode.workspace.getConfiguration('contextkit');
  const budget = config.get('defaultBudget') || 8000;

  statusBarItem.text = '$(sync~spin) Finding context...';

  try {
    const result = await runContextKit(
      ['select', `"${query}"`, '--budget', String(budget), '--format', 'markdown'],
      workspacePath
    );

    // Create a new document with the result
    const doc = await vscode.workspace.openTextDocument({
      content: result,
      language: 'markdown'
    });
    
    await vscode.window.showTextDocument(doc, { preview: true });
    
    // Copy to clipboard
    await vscode.env.clipboard.writeText(result);
    vscode.window.showInformationMessage('ContextKit: Context copied to clipboard!');
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    if (message.includes('not initialized')) {
      const action = await vscode.window.showErrorMessage(
        'ContextKit: Workspace not initialized. Initialize now?',
        'Initialize'
      );
      if (action === 'Initialize') {
        await indexWorkspace();
      }
    } else {
      vscode.window.showErrorMessage(`ContextKit: ${message}`);
    }
  } finally {
    statusBarItem.text = '$(search) ContextKit';
  }
}

async function selectContextFromSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('ContextKit: No active editor');
    return;
  }

  const selection = editor.document.getText(editor.selection);
  if (!selection) {
    vscode.window.showWarningMessage('ContextKit: No text selected');
    return;
  }

  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  const config = vscode.workspace.getConfiguration('contextkit');
  const budget = config.get('defaultBudget') || 8000;

  statusBarItem.text = '$(sync~spin) Finding related code...';

  try {
    // Use the selection as the query
    const query = `Code related to: ${selection.slice(0, 500)}`;
    
    const result = await runContextKit(
      ['select', `"${query}"`, '--budget', String(budget), '--format', 'markdown'],
      workspacePath
    );

    const doc = await vscode.workspace.openTextDocument({
      content: result,
      language: 'markdown'
    });
    
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    await vscode.env.clipboard.writeText(result);
    
    vscode.window.showInformationMessage('ContextKit: Related code copied to clipboard!');
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`ContextKit: ${message}`);
  } finally {
    statusBarItem.text = '$(search) ContextKit';
  }
}

async function indexWorkspace() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  statusBarItem.text = '$(sync~spin) Indexing...';
  outputChannel.show();
  outputChannel.appendLine('Starting workspace indexing...');

  try {
    // Check if initialized
    try {
      await runContextKit(['doctor', '--json'], workspacePath);
    } catch {
      // Not initialized, init first
      outputChannel.appendLine('Initializing ContextKit...');
      await runContextKit(['init'], workspacePath);
      
      // Add common source directories
      const srcExists = await vscode.workspace.fs.stat(vscode.Uri.file(`${workspacePath}/src`))
        .then(() => true, () => false);
      
      if (srcExists) {
        await runContextKit(['source', 'add', './src'], workspacePath);
      } else {
        await runContextKit(['source', 'add', '.'], workspacePath);
      }
    }

    // Run indexing
    outputChannel.appendLine('Indexing files...');
    const result = await runContextKit(['index'], workspacePath);
    outputChannel.appendLine(result);

    vscode.window.showInformationMessage('ContextKit: Indexing complete!');
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`ContextKit indexing failed: ${message}`);
    outputChannel.appendLine(`Error: ${message}`);
  } finally {
    statusBarItem.text = '$(search) ContextKit';
  }
}

async function checkAndIndex() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  try {
    const result = await runContextKit(['doctor', '--json'], workspacePath);
    const checks = JSON.parse(result);
    
    const hasErrors = checks.some((c: { status: string }) => c.status === 'error');
    
    if (hasErrors) {
      const action = await vscode.window.showInformationMessage(
        'ContextKit: Workspace needs indexing. Index now?',
        'Index', 'Later'
      );
      if (action === 'Index') {
        await indexWorkspace();
      }
    } else {
      outputChannel.appendLine('ContextKit: Workspace already indexed');
    }
  } catch {
    // Silently fail on startup check
    outputChannel.appendLine('ContextKit: Could not check workspace status');
  }
}

async function showStatus() {
  const workspacePath = await getWorkspacePath();
  if (!workspacePath) return;

  try {
    const result = await runContextKit(['doctor'], workspacePath);
    outputChannel.clear();
    outputChannel.appendLine(result);
    outputChannel.show();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    outputChannel.appendLine(`Status check failed: ${message}`);
    outputChannel.show();
  }
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
