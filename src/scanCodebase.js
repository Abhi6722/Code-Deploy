const vscode = require("vscode");
const path = require("path");
const fs = require("fs").promises;
const { GoogleGenerativeAI } = require("@google/generative-ai");

const scanCodebaseDisposable = vscode.commands.registerCommand(
  "codedeploy.scanCodebase",
  async function () {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showInformationMessage(
        "Please open a workspace folder first."
      );
      return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    vscode.window.showInformationMessage("Scanning codebase...");

    const projectInfo = await scanCodebase(rootPath);
    if (!projectInfo) {
      vscode.window.showErrorMessage("Failed to scan codebase.");
      return;
    }

    vscode.window.showInformationMessage(
      `Detected Project Type: ${
        projectInfo.type
      }, Technologies: ${projectInfo.technologies.join(", ")}`
    );
  }
);

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

  const dockerFileContent = await callGeminiAPI(rootPath, projectInfo);
  if (dockerFileContent) {
    await createDockerfile(rootPath, dockerFileContent);
  }

  return projectInfo;
}

async function callGeminiAPI(rootPath, projectInfo) {
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
    const prompt = `Generate Dockerfile for ${projectInfo.type} project with the following dependencies/requirements ${projectInfo.technologies}. Don't Give me anything extra except this docker file I just need the content of the docker file nothing more`;
    const result = await model.generateContent([{ text: prompt }]);

    if (result.response && result.response.text) {
      const dockerfileContent = result.response
        .text()
        .replace(/^```dockerfile\s+|\s+```$/g, "");
      console.log(dockerfileContent);
      return dockerfileContent;
    } else {
      vscode.window.showErrorMessage("Failed to generate Dockerfile content.");
      return null;
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    vscode.window.showErrorMessage("Failed to call Gemini API.");
    return null;
  }
}

async function createDockerfile(rootPath, content) {
  try {
    const dockerfilePath = path.join(rootPath, "Dockerfile");
    await fs.writeFile(dockerfilePath, content, { encoding: "utf-8" });
    return true;
  } catch (error) {
    console.error("Error creating Dockerfile:", error);
    vscode.window.showErrorMessage("Failed to create Dockerfile.");
    return false;
  }
}

module.exports = {
  scanCodebaseDisposable,
};
