const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const { GoogleGenerativeAI } = require("@google/generative-ai");

const generateDocumentationDisposable = vscode.commands.registerCommand(
  "codedeploy.generateDocumentation",
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

    let mainFile;
    if (projectInfo.type === "Node.js") {
      mainFile = path.join(rootPath, "package.json");
    } else if (projectInfo.type === "Python") {
      mainFile = path.join(rootPath, "requirements.txt");
    } else {
      vscode.window.showErrorMessage(
        "Unsupported project type for documentation generation."
      );
      return;
    }

    const docType = await vscode.window.showQuickPick(
      ["PDF", "Word", "Markdown"],
      {
        placeHolder: "Select the documentation format",
      }
    );
    if (!docType) {
      vscode.window.showInformationMessage(
        "No documentation format selected. Documentation generation canceled."
      );
      return;
    }

    const docContent = await generateDocumentation( mainFile, docType);

    if (docContent) {
      let docFileName;
      let docFilePath;
      switch (docType.toLowerCase()) {
        case "pdf":
          docFileName = "documentation.pdf";
          docFilePath = path.join(rootPath, docFileName);
          // await generatePDFDocument(docFilePath, docContent);
          await fs.writeFile(docFilePath, docContent, "utf8");
          vscode.window.showInformationMessage(
            `Documentation generated: ${docFileName}`
          );
          break;
        case "word":
          docFileName = "documentation.docx";
          docFilePath = path.join(rootPath, docFileName);
          // await generateWordDocument(docFilePath, docContent);
          await fs.writeFile(docFilePath, docContent, "utf8");
          vscode.window.showInformationMessage(
            `Documentation generated: ${docFileName}`
          );
          break;
        case "markdown":
          docFileName = "documentation.md";
          docFilePath = path.join(rootPath, docFileName);
          await fs.writeFile(docFilePath, docContent, "utf8");
          vscode.window.showInformationMessage(
            `Documentation generated: ${docFileName}`
          );
          break;
        default:
          vscode.window.showErrorMessage("Unsupported documentation format.");
          return;
      }
    } else {
      vscode.window.showErrorMessage("Failed to generate documentation.");
    }
  }
);

async function generatePDFDocument(filePath, content) {
  try {
    console.log(filePath, content);
    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    return false;
  }
}

async function generateWordDocument(filePath, content) {
  try {
    console.log(filePath, content);
  } catch (error) {
    console.error("Error generating Word document:", error);
    return false;
  }
}

async function scanCodebase(rootPath) {
  const projectInfo = {
    type: "Unknown",
    technologies: [],
  };

  const files = await fs.readdir(rootPath);
  for (const file of files) {
    if (file === "package.json") {
      projectInfo.type = "Node.js";
      const packageJson = JSON.parse(
        await fs.readFile(path.join(rootPath, file), "utf-8")
      );
      projectInfo.technologies = Object.keys(
        packageJson.dependencies || {}
      ).concat(Object.keys(packageJson.devDependencies || {}));
      break;
    } else if (file === "requirements.txt") {
      projectInfo.type = "Python";
      const requirements = (
        await fs.readFile(path.join(rootPath, file), "utf-8")
      )
        .split("\n")
        .filter(Boolean);
      projectInfo.technologies = requirements;
      break;
    }
  }
  return projectInfo;
}

async function generateDocumentation(mainFile, docType) {
  try {
    const apiKey = vscode.workspace
      .getConfiguration()
      .get("codedeploy.geminiApiKey");
    if (!apiKey) {
      vscode.window.showErrorMessage(
        "Please configure your Gemini API key in the settings."
      );
      return null;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let mainFileContent;
    try {
      mainFileContent = await fs.readFile(mainFile, "utf-8");
    } catch (error) {
      console.error("Error reading main file:", error);
      vscode.window.showErrorMessage("Failed to read main file.");
      return null;
    }

    const prompt = `Generate ${docType} documentation for the project with the main file with content ${mainFileContent}`;
    console.log(prompt);
    const result = await model.generateContent([{ text: prompt }]);
    console.log(result);
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

module.exports = {
  generateDocumentationDisposable,
};