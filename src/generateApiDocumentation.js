const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const { GoogleGenerativeAI } = require("@google/generative-ai");

let generatedHtmlContent = "";

const generateApiDocumentationDisposable = vscode.commands.registerCommand(
  "codedeploy.generateApiDocumentationDisposable",
  async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showInformationMessage(
        "Please open a workspace folder first."
      );
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const projectInfo = await scanCodebase(rootPath);
    if (!projectInfo) {
      vscode.window.showErrorMessage("Failed to scan codebase.");
      return;
    }

    const apiKey = vscode.workspace
      .getConfiguration()
      .get("codedeploy.geminiApiKey");
    if (!apiKey) {
      vscode.window.showErrorMessage(
        "Please configure your Gemini API key in the settings."
      );
      return;
    }

    const documentationContent = await generateAPIDocumentation(
      rootPath,
      apiKey,
      projectInfo
    );

    if (documentationContent) {
      const documentationFilePath = path.join(rootPath, "API_Documentation.md");
      try {
        await fs.writeFile(documentationFilePath, documentationContent);
        vscode.window.showInformationMessage(
          `API Documentation generated successfully: ${documentationFilePath}`
        );
      } catch (error) {
        console.error("Error writing documentation file:", error);
        vscode.window.showErrorMessage("Failed to write documentation file.");
        return;
      }

      const generatePlayground = await vscode.window.showInformationMessage(
        "Do you want to generate a playground script to test these APIs?",
        "Yes",
        "No"
      );

      if (generatePlayground === "Yes") {
        const playgroundScript = await generatePlaygroundScript(
          apiKey,
          documentationContent
        );
        if (playgroundScript) {
          try {
            // Extract HTML content between <html> tags
            generatedHtmlContent = extractHtmlContent(playgroundScript);
            if (generatedHtmlContent) {
              const playgroundFilePath = path.join(
                rootPath,
                "API_Playground.html"
              );
              await fs.writeFile(playgroundFilePath, playgroundScript);
              vscode.window.showInformationMessage(
                `API Playground script generated successfully: ${playgroundFilePath}`
              );

              // Open the generated HTML content in a webview
              openHtmlInWebview(generatedHtmlContent);
            } else {
              vscode.window.showErrorMessage(
                "Failed to extract HTML content from playground script."
              );
            }
          } catch (error) {
            console.error("Error writing playground file:", error);
            vscode.window.showErrorMessage("Failed to write playground file.");
          }
        }
      }
    }
  }
);

function extractHtmlContent(playgroundScript) {
  const match = playgroundScript.match(/<html([\s\S]*?)<\/html>/i);
  return match ? match[0] : null;
}

async function openHtmlInWebview(htmlContent) {
  const panel = vscode.window.createWebviewPanel(
    "htmlViewer", // Identifies the type of webview
    "Generated HTML Preview", // Title displayed to the user
    vscode.ViewColumn.One, // Editor column to show the new webview panel in
    {
      enableScripts: true, // Enable scripts in the webview
    }
  );

  // Set HTML content in the webview
  panel.webview.html = htmlContent;
}

async function scanCodebase(rootPath) {
  const projectInfo = {
    type: "Unknown",
    technologies: [],
  };

  const files = await getAllFiles(rootPath);
  for (const file of files) {
    if (path.basename(file) === "package.json") {
      projectInfo.type = "Node.js";
      const packageJson = JSON.parse(await fs.readFile(file, "utf-8"));
      projectInfo.technologies = Object.keys(
        packageJson.dependencies || {}
      ).concat(Object.keys(packageJson.devDependencies || {}));
      break;
    } else if (path.basename(file) === "requirements.txt") {
      projectInfo.type = "Python";
      const requirements = (await fs.readFile(file, "utf-8"))
        .split("\n")
        .filter(Boolean);
      projectInfo.technologies = requirements;
      break;
    }
  }
  return projectInfo;
}

async function getAllFiles(dirPath, files = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== "node_modules" &&
      !entry.name.startsWith(".")
    ) {
      await getAllFiles(fullPath, files);
    } else if (
      entry.isFile() &&
      !entry.name.startsWith(".") &&
      entry.name !== "package-lock.json"
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

async function generateAPIDocumentation(rootPath, apiKey, projectInfo) {
  try {
    console.log("Generating API documentation for project:", projectInfo);
    console.log(rootPath, apiKey, projectInfo);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let prompt = `Generate API documentation for the project located at ${rootPath}\n\n`;

    const files = await getAllFiles(rootPath);
    for (const file of files) {
      try {
        const fileContent = await fs.readFile(file, "utf-8");
        const relativePath = path.relative(rootPath, file);
        prompt += `File: ${relativePath}\n${fileContent}\n\n`;
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }

    console.log(prompt);

    const result = await model.generateContent([{ text: prompt }]);

    if (result.response && result.response.text) {
      return result.response.text();
    } else {
      vscode.window.showErrorMessage(
        "Failed to generate documentation content."
      );
      return null;
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    vscode.window.showErrorMessage("Failed to call Gemini API.");
    return null;
  }
}

async function generatePlaygroundScript(apiKey, documentationContent) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Generate an HTML page for API testing with the following features:
      
      1. Interactive form elements to input URL, HTTP method, headers, and request body just like swagger or postman.
      2. Use inline CSS for styling to make it visually appealing and make it consistent and modern looking.
      3. Fully functional buttons to execute API requests (GET, POST, PUT, DELETE).
      4. Display area to show response data and should be complete working.
      
      Documentation Content:
      ${documentationContent}
    `;

    const result = await model.generateContent([{ text: prompt }]);

    if (result.response && result.response.text) {
      return result.response.text();
    } else {
      vscode.window.showErrorMessage("Failed to generate playground script.");
      return null;
    }
  } catch (error) {
    console.error("Error calling Gemini API for playground script:", error);
    vscode.window.showErrorMessage(
      "Failed to call Gemini API for playground script."
    );
    return null;
  }
}

module.exports = {
  generateApiDocumentationDisposable,
};
