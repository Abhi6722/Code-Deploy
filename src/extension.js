const { registerCodeDeployCommand } = require("./dashboard");
const { generateDocumentationDisposable } = require("./generateDocument");
const { generateApiDocumentationDisposable } = require("./generateApiDocumentation");
const { scanCodebaseDisposable } = require("./scanCodebase");

require("@google/generative-ai");
require("dotenv").config();

function activate(context) {
  console.log('Congratulations, your extension "codedeploy" is now active!');
  const codeDeployDashboardDisposable = registerCodeDeployCommand(context);
  context.subscriptions.push(scanCodebaseDisposable);
  context.subscriptions.push(codeDeployDashboardDisposable);
  context.subscriptions.push(generateDocumentationDisposable);
  context.subscriptions.push(generateApiDocumentationDisposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
