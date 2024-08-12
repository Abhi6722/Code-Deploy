const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;

let panel;

function registerCodeDeployCommand(context) {
  return vscode.commands.registerCommand("codedeploy.codeDeploy", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showInformationMessage("Please open a workspace folder first.");
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    vscode.window.showInformationMessage("Scanning codebase...");

    const projectInfo = await scanCodebase(rootPath);
    console.log("Project Info after scanning:", projectInfo);
    if (!projectInfo) {
      vscode.window.showErrorMessage("Failed to scan codebase.");
      return;
    }

    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        "projectDashboard",
        "Project Dashboard",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))],
        }
      );

      const dashboardHtml = await getWebviewContent(context.extensionPath, projectInfo);
      panel.webview.html = dashboardHtml;

      panel.onDidDispose(() => {
        panel = undefined;
      });
    } else {
      panel.reveal();
    }

    panel.webview.postMessage({
      command: "updateDashboard",
      data: projectInfo,
    });
  });
}

async function scanCodebase(rootPath) {
  const projectInfo = {
    fileCount: 0,
    folderCount: 0,
    fileTypes: [],
    languageStats: [],
  };

  const extensionToLanguage = {
    "ts": { language: "TypeScript", color: "#007acc" },
    "js": { language: "JavaScript", color: "#f1e05a" },
    "rs": { language: "Rust", color: "#dea584" },
    "css": { language: "CSS", color: "#563d7c" },
    "ipynb": { language: "Jupyter Notebook", color: "#da5b0b" },
    "html": { language: "HTML", color: "#e34c26" },
    // Add more mappings as needed
  };

  const languageCounts = {};

  async function walkDirectory(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        projectInfo.folderCount++;
        await walkDirectory(entryPath);
      } else {
        projectInfo.fileCount++;
        const ext = path.extname(entry.name).slice(1);
        if (!projectInfo.fileTypes.includes(ext)) {
          projectInfo.fileTypes.push(ext);
        }
        if (extensionToLanguage[ext]) {
          const language = extensionToLanguage[ext].language;
          if (!languageCounts[language]) {
            languageCounts[language] = 0;
          }
          languageCounts[language]++;
        }
      }
    }
  }

  await walkDirectory(rootPath);

  const totalFiles = projectInfo.fileCount;
  let totalPercentage = 0;
  projectInfo.languageStats = Object.keys(languageCounts).map(language => {
    const count = languageCounts[language];
    const percentage = ((count / totalFiles) * 100).toFixed(1);
    totalPercentage += parseFloat(percentage);
    const color = extensionToLanguage[Object.keys(extensionToLanguage).find(key => extensionToLanguage[key].language === language)] ? extensionToLanguage[Object.keys(extensionToLanguage).find(key => extensionToLanguage[key].language === language)].color : "#000000";
    return {
      language,
      percentage: parseFloat(percentage),
      color,
    };
  });

  if (totalPercentage < 100) {
    projectInfo.languageStats.push({
      language: "Other",
      percentage: parseFloat((100 - totalPercentage).toFixed(1)),
      color: "#cccccc",
    });
  }

  return projectInfo;
}

async function getWebviewContent(extensionPath, projectInfo) {
  const fileTypes = projectInfo.fileTypes.filter(type => type !== "").join(", ") || "None";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CodeDeploy Dashboard</title>
<link rel="stylesheet" href="styles.css">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
    :root {
        --background-color: var(--vscode-editor-background);
        --foreground-color: var(--vscode-editor-foreground);
        --primary-color: var(--vscode-button-background);
        --primary-hover-color: var(--vscode-button-hoverBackground);
        --border-color: var(--vscode-editorGroup-border);
        --active-tab-color: #007acc; /* Active tab background color */
        --inactive-tab-color: #72afd8; /* Inactive tab background color */
    }
    body {
        font-family: 'Roboto', sans-serif;
        background-color: var(--background-color);
        color: var(--foreground-color);
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        padding-top: 100px;
        padding-bottom: 100px;
    }
    .dashboard {
        background: var(--background-color);
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        width: 80%;
        max-width: 900px;
        padding: 20px;
        border: 1px solid var(--border-color);
        display: grid;
        grid-template-columns: 1fr;
        gap: 20px;
    }
    .dashboard-header {
        text-align: center;
        margin-bottom: 20px;
    }
    .dashboard-header h1 {
        margin: 0;
        font-size: 2em;
        color: var(--foreground-color);
    }
    .dashboard-header p {
        color: var(--foreground-color);
    }
    h2 {
        font-size: 1.5em;
        color: var(--foreground-color);
        border-bottom: 2px solid var(--primary-color);
        padding-bottom: 5px;
    }
    .workspace-language-row {
        display: flex;
        justify-content: space-between;
        gap: 50px;
    }
    .workspace-language-row .workspace-details{
      flex: 1;
    }
    .workspace-language-row .language-stats{
      flex: 1;
    }
    .stats-content {
        display: flex;
        flex-direction: column;
    }
    .stat-bar {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
    }
    .stat-bar-color {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        margin-right: 10px;
    }
    .tab {
        display: flex;
        justify-content: space-around;
        margin-bottom: 10px;
    }
    .tab-button {
        background-color: var(--background-color);
        color: var(--foreground-color);
        border: 1px solid var(--border-color);
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.3s;
        flex: 1;
        text-align: center;
        margin: 0 5px;
    }
    .tab-button:hover {
        background-color: var(--primary-hover-color);
    }
    .tab-button.active {
        background-color: var(--active-tab-color);
        color: white; /* Change text color for active tab */
    }
    .tab-content {
        display: none;
        padding: 10px;
        border: 1px solid var(--border-color);
        border-radius: 5px;
        background-color: var(--background-color);
    }
    .active {
        display: block;
    }
    .detail-item {
        display: flex;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid var(--border-color);
    }
    .detail-title {
        font-weight: 500;
        color: var(--foreground-color);
    }
    .detail-content {
        color: var(--foreground-color);
    }
</style>
</head>
<body>
<div class="dashboard">
<header class="dashboard-header">
    <h1>CodeDeploy Dashboard</h1>
    <p>Manage and document your project efficiently</p>
</header>
<div class="workspace-language-row">
  <section class="workspace-details">
      <h2>Workspace Details</h2>
      <div class="detail-item">
          <span class="detail-title">File Count:</span>
          <span class="detail-content">${projectInfo.fileCount}</span>
      </div>
      <div class="detail-item">
          <span class="detail-title">Folder Count:</span>
          <span class="detail-content">${projectInfo.folderCount}</span>
      </div>
      <div class="detail-item">
          <span class="detail-title">File Types:</span>
          <span class="detail-content">${fileTypes}</span>
      </div>
  </section>
  <section class="language-stats">
      <h2>Language Statistics</h2>
      <div id="languageStats" class="stats-content">
          ${projectInfo.languageStats.map(stat => `
              <div class="stat-bar">
                  <span class="stat-bar-color" style="background-color: ${stat.color};"></span>
                  <span>${stat.language}: ${stat.percentage}%</span>
              </div>
          `).join('')}
      </div>
  </section>
</div>
<div class="tab">
    <button class="tab-button active" onclick="showTab('commands', this)">Available Commands</button>
    <button class="tab-button" onclick="showTab('howToUse', this)">How to Use</button>
    <button class="tab-button" onclick="showTab('deployment', this)">Deployment Instructions</button>
</div>
<div id="commands" class="tab-content active">
    <h2>Available Commands</h2>
    <div class="command-description">
        <strong>codedeploy.codeDeploy</strong>: Scans the codebase and displays project information.
        <p>Usage: Open the command palette (Ctrl+Shift+P) and type <code>codedeploy.codeDeploy</code> to execute.</p>
    </div>
    <div class="command-description">
        <strong>codedeploy.generateDocumentation</strong>: Generates documentation for the project.
        <p>Usage: Open the command palette (Ctrl+Shift+P) and type <code>codedeploy.generateDocumentation</code> to execute. You will be prompted to select the documentation format (PDF, Word, Markdown).</p>
    </div>
    <div class="command-description">
        <strong>codedeploy.generateApiDocumentation</strong>: Generates API documentation for the project.
        <p>Usage: Open the command palette (Ctrl+Shift+P) and type <code>codedeploy.generateApiDocumentation</code> to execute.</p>
    </div>
</div>
<div id="howToUse" class="tab-content">
    <h2>How to Use:</h2>
    <p>To use the commands, open the command palette (Ctrl+Shift+P) and type the command name.</p>
</div>
<div id="deployment" class="tab-content">
    <h2>Deployment Instructions</h2>
    <p>Follow these steps to deploy your project:</p>
    <ol>
        <li>Ensure that your project is properly configured with the necessary files (e.g., <code>package.json</code> for Node.js or <code>requirements.txt</code> for Python).</li>
        <li>Open the command palette (Ctrl+Shift+P) and run <code>codedeploy.codeDeploy</code> to scan your codebase.</li>
        <li>After scanning, you can generate documentation by running <code>codedeploy.generateDocumentation</code>.</li>
        <li>For API documentation, run <code>codedeploy.generateApiDocumentation</code>.</li>
        <li>Follow any additional instructions provided in the output messages.</li>
    </ol>
</div>
</div>
<script>
function showTab(tabName, button) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    // Update active tab button
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');
}
</script>
</body>
</html>`;
}

module.exports = { registerCodeDeployCommand };