import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// Define HTTP methods constant for reuse
const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
];

// Add this new function to check for Next.js project
function isNextJsProject(workspacePath: string): boolean {
  try {
    // Check for package.json
    const packageJsonPath = path.join(workspacePath, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    // Read and parse package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    // Check if next.js is a dependency
    return !!(
      (packageJson.dependencies && packageJson.dependencies.next) ||
      (packageJson.devDependencies && packageJson.devDependencies.next)
    );
  } catch (error) {
    return false;
  }
}

// Add this function to check for App Router
function hasAppDirectory(workspacePath: string): boolean {
  return (
    fs.existsSync(path.join(workspacePath, "app")) ||
    fs.existsSync(path.join(workspacePath, "src", "app"))
  );
}

// Add route creation functionality
async function createNewRoute(
  appDirPath: string,
  parentPath?: string
): Promise<void> {
  // Ask for the route path input with optional pre-filled value
  const input = await vscode.window.showInputBox({
    placeHolder: "e.g., /api/hello or /products/[id]:POST",
    prompt:
      "Enter route path (optionally followed by :METHOD, defaults to GET)",
    value: parentPath ? `${parentPath}/` : "",
    validateInput: (value) => {
      if (!value) {
        return "Route path cannot be empty";
      }

      if (value.includes(":")) {
        const method = value.split(":").pop()?.toUpperCase();
        if (!HTTP_METHODS.includes(method!)) {
          return `Valid methods: ${HTTP_METHODS.join(", ")}`;
        }
      }

      // Check for invalid segments
      const segments = value.split("/").filter(Boolean);
      for (const segment of segments) {
        if (segment.startsWith("_")) {
          return "Segments starting with underscore (_) are private and will be excluded from routing";
        }

        // Check for malformed brackets
        const openBrackets = segment.split("[").length - 1;
        const closeBrackets = segment.split("]").length - 1;
        if (openBrackets !== closeBrackets) {
          return "Malformed dynamic segment. Make sure brackets are properly closed.";
        }
      }

      return null;
    },
  });

  if (!input) return; // User canceled

  try {
    // Parse input to extract path and method (defaults to GET)
    let routePath: string;
    let method: string = "GET"; // Default method is GET

    if (input.includes(":")) {
      const parts = input.split(":");
      routePath = parts[0];
      method = parts[1].toUpperCase();
    } else {
      routePath = input;
    }

    // Clean up route path
    const cleanPath = routePath.startsWith("/")
      ? routePath.substring(1)
      : routePath;

    // Create the directory structure
    const routeDir = path.join(appDirPath, ...cleanPath.split("/"));

    // Check if directory exists, create if it doesn't
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }

    // Determine file type based on existing files in the project
    const fileExtension = detectProjectFileType(appDirPath);

    const routeFilePath = path.join(routeDir, `route.${fileExtension}`);

    // Check if file already exists
    if (fs.existsSync(routeFilePath)) {
      // If the file exists, check if the method is already defined
      const content = fs.readFileSync(routeFilePath, "utf-8");
      if (content.includes(`export async function ${method}`)) {
        vscode.window.showWarningMessage(
          `Method ${method} already exists in ${routeFilePath}`
        );
        return;
      }

      // Append the new method to the existing file
      const newMethod = generateRouteHandler(method, fileExtension);
      fs.appendFileSync(routeFilePath, `\n\n${newMethod}`);
    } else {
      // Create new route file with the method
      const routeContent = generateRouteFile(method, fileExtension);
      fs.writeFileSync(routeFilePath, routeContent);
    }

    // Open the file in editor
    const document = await vscode.workspace.openTextDocument(routeFilePath);
    await vscode.window.showTextDocument(document);

    // Refresh the routes tree view
    vscode.commands.executeCommand("nextjs-navigator.refreshRoutes");

    vscode.window.showInformationMessage(
      `Route ${routePath}:${method} created successfully`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create route: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Update the deleteRoute function to properly handle folder deletions
async function deleteRoute(filePath: string, routePath: string): Promise<void> {
  if (!filePath || !fs.existsSync(filePath)) {
    vscode.window.showErrorMessage("Route file not found.");
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Are you sure you want to delete route '${routePath}'?`,
    { modal: true },
    "Delete"
  );

  if (confirmation !== "Delete") {
    return;
  }

  try {
    // Get directory path before deleting the file
    const dir = path.dirname(filePath);

    // Delete the file
    fs.unlinkSync(filePath);

    // Find the app directory path to use as the boundary for recursion
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let appDirPath: string | undefined;

    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootPath = workspaceFolders[0].uri.fsPath;
      const appDir = path.join(rootPath, "app");
      const srcAppDir = path.join(rootPath, "src", "app");

      if (fs.existsSync(appDir) && dir.startsWith(appDir)) {
        appDirPath = appDir;
      } else if (fs.existsSync(srcAppDir) && dir.startsWith(srcAppDir)) {
        appDirPath = srcAppDir;
      }
    }

    // Clean up empty directories recursively, stopping at app directory
    if (appDirPath) {
      cleanupEmptyDirectories(dir, appDirPath);
    }

    // Refresh the routes tree view
    vscode.commands.executeCommand("nextjs-navigator.refreshRoutes");

    vscode.window.showInformationMessage(
      `Route ${routePath} deleted successfully`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to delete route: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Improved function to recursively clean up empty directories
function cleanupEmptyDirectories(dirPath: string, appDirPath: string): void {
  // Don't delete the app directory itself or any directory outside of it
  if (!dirPath || dirPath === appDirPath || !dirPath.startsWith(appDirPath)) {
    return;
  }

  try {
    // Check if directory exists (it might have been deleted in a previous recursive call)
    if (!fs.existsSync(dirPath)) {
      return;
    }

    // Read directory contents
    const items = fs.readdirSync(dirPath);

    // If directory is not empty, stop recursion
    if (items.length > 0) {
      return;
    }

    console.log(`Deleting empty directory: ${dirPath}`);
    // Directory is empty, delete it
    fs.rmdirSync(dirPath);

    // Recursively check parent directory
    const parentDir = path.dirname(dirPath);
    cleanupEmptyDirectories(parentDir, appDirPath);
  } catch (error) {
    console.error(`Error cleaning up directory ${dirPath}:`, error);
    // Continue with execution, don't throw - this is a cleanup operation
  }
}

// Add this function to clean up orphaned directories
function cleanupOrphanedDirectories(appDirPath: string): void {
  if (!appDirPath || !fs.existsSync(appDirPath)) {
    return;
  }

  try {
    // Get all directories under app directory
    const validDirectories = new Set<string>();
    const allDirectories = new Set<string>();

    // First build a list of valid directories that contain route files
    function collectValidDirectories(dirPath: string, basePath: string) {
      if (!fs.existsSync(dirPath)) return;

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        // Add current directory to all directories list
        const relPath = path.relative(basePath, dirPath);
        if (relPath) {
          allDirectories.add(dirPath);
        }

        // Check if this directory contains a valid route file
        let hasRouteFile = false;

        for (const entry of entries) {
          const entryPath = path.join(dirPath, entry.name);

          if (
            entry.isDirectory() &&
            !["node_modules", ".next", ".git"].includes(entry.name) &&
            !entry.name.startsWith("_")
          ) {
            // Process subdirectories
            collectValidDirectories(entryPath, basePath);
          } else if (/^route\.(js|ts|jsx|tsx)$/.test(entry.name)) {
            // Found a route file, mark directory as valid
            validDirectories.add(dirPath);
            hasRouteFile = true;
            break;
          }
        }

        // If this directory or any parent contains a route file, mark it as valid
        if (hasRouteFile) {
          let currentDir = dirPath;
          while (currentDir !== basePath) {
            validDirectories.add(currentDir);
            currentDir = path.dirname(currentDir);
          }
        }
      } catch (error) {
        console.error(`Error processing directory ${dirPath}:`, error);
      }
    }

    // Collect all directories and valid directories
    collectValidDirectories(appDirPath, appDirPath);

    // Clean up all directories that don't have route files
    const dirArray = Array.from(allDirectories);

    // Sort by depth (deepest first) to ensure we process children before parents
    dirArray.sort((a, b) => {
      const depthA = a.split(path.sep).length;
      const depthB = b.split(path.sep).length;
      return depthB - depthA; // Descending order
    });

    // Clean up empty directories that don't contain route files
    for (const dir of dirArray) {
      if (!validDirectories.has(dir)) {
        try {
          // Check if directory exists and is empty
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            console.log(`Cleaning up orphaned directory: ${dir}`);
            fs.rmdirSync(dir);
          }
        } catch (error) {
          console.error(`Error cleaning up directory ${dir}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("Error in cleanup process:", error);
  }
}

// Helper function to detect file type
function detectProjectFileType(appDirPath: string): string {
  // Check if TypeScript is used in the project
  const tsFiles = findFiles(appDirPath, /\.(ts|tsx)$/);
  return tsFiles.length > 0 ? "ts" : "js";
}

// Helper function to find files with specific pattern
function findFiles(dirPath: string, pattern: RegExp, maxFiles = 5): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= maxFiles) break;

    const entryPath = path.join(dirPath, entry.name);
    if (
      entry.isDirectory() &&
      !["node_modules", ".next", ".git"].includes(entry.name)
    ) {
      results.push(...findFiles(entryPath, pattern, maxFiles - results.length));
    } else if (pattern.test(entry.name)) {
      results.push(entryPath);
    }
  }

  return results;
}

// Generate route handler function for a method
function generateRouteHandler(method: string, fileExt: string): string {
  const typeDef = fileExt === "ts" ? "(request: NextRequest)" : "(request)";
  return `export const ${method} = ${typeDef} => {
  return NextResponse.json({ message: 'Hello from Next.js!' });
};`;
}

// Generate complete route file
function generateRouteFile(method: string, fileExt: string): string {
  const imports =
    fileExt === "ts"
      ? "import { NextRequest, NextResponse } from 'next/server';\n\n"
      : "";

  return `${imports}${generateRouteHandler(method, fileExt)}`;
}

// Add the route renaming functionality
async function renameRoute(appDirPath: string, node: RouteNode): Promise<void> {
  if (!node.filePath || !node.routePath) {
    vscode.window.showErrorMessage(
      "Cannot rename route: missing file information"
    );
    return;
  }

  // Ask for the new route path input with current path as default value
  const currentPath = node.routePath;
  const input = await vscode.window.showInputBox({
    placeHolder: "Enter new route path (e.g., /api/v2/users)",
    prompt: "Enter new path for this route",
    value: currentPath,
    validateInput: (value) => {
      if (!value) {
        return "Route path cannot be empty";
      }

      // Check for invalid segments
      const segments = value.split("/").filter(Boolean);
      for (const segment of segments) {
        if (segment.startsWith("_")) {
          return "Segments starting with underscore (_) are private and will be excluded from routing";
        }

        // Check for malformed brackets
        const openBrackets = segment.split("[").length - 1;
        const closeBrackets = segment.split("]").length - 1;
        if (openBrackets !== closeBrackets) {
          return "Malformed dynamic segment. Make sure brackets are properly closed.";
        }
      }

      return null;
    },
  });

  if (!input || input === currentPath) return; // User canceled or no change

  try {
    // Clean up both routes to ensure consistent format
    const cleanCurrentPath = currentPath.startsWith("/")
      ? currentPath.substring(1)
      : currentPath;

    const cleanNewPath = input.startsWith("/") ? input.substring(1) : input;

    // Get the route file information
    const sourceFilePath = node.filePath;
    const sourceDir = path.dirname(sourceFilePath);
    const fileName = path.basename(sourceFilePath);

    // Track original source directory for cleanup
    const originalSourceDir = sourceDir;

    // Construct the target directory path
    const relativePath = getRelativePathFromAppDir(appDirPath, sourceDir);
    const relativeSegments = relativePath.split(path.sep).filter(Boolean);
    const pathDepth = getRoutePathDepth(cleanCurrentPath);

    // Adjust directory structure based on path depth to handle route groups
    let targetDirRelative: string;
    if (relativeSegments.length === pathDepth) {
      // Direct mapping between file structure and route path
      targetDirRelative = cleanNewPath.split("/").join(path.sep);
    } else {
      // Handle route groups by preserving the structure
      const pathSegments = cleanCurrentPath.split("/");
      const newPathSegments = cleanNewPath.split("/");

      // Find the deepest common directory that's not in a route group
      let routeSegmentIndex = 0;
      const adjustedSegments = [...relativeSegments];

      for (let i = 0; i < relativeSegments.length; i++) {
        const segment = relativeSegments[i];
        // Skip route groups (they don't affect the URL)
        if (segment.startsWith("(") && segment.endsWith(")")) {
          continue;
        }

        if (routeSegmentIndex < pathSegments.length) {
          // Replace path segment with new one at the same position
          if (routeSegmentIndex < newPathSegments.length) {
            adjustedSegments[i] = newPathSegments[routeSegmentIndex];
          }
          routeSegmentIndex++;
        }
      }

      // If the new path has more segments, append them
      while (routeSegmentIndex < newPathSegments.length) {
        adjustedSegments.push(newPathSegments[routeSegmentIndex]);
        routeSegmentIndex++;
      }

      targetDirRelative = adjustedSegments.join(path.sep);
    }

    const targetDir = path.join(appDirPath, targetDirRelative);
    const targetFilePath = path.join(targetDir, fileName);

    // Check if source and target are the same
    if (path.relative(sourceDir, targetDir) === "") {
      vscode.window.showInformationMessage(
        "The route path didn't change the actual file location."
      );
      return;
    }

    // Check if target directory already exists
    if (fs.existsSync(targetDir)) {
      // Check if target file already exists
      if (fs.existsSync(targetFilePath)) {
        const confirmation = await vscode.window.showWarningMessage(
          `A route file already exists at the target location. Do you want to merge the HTTP methods?`,
          { modal: true },
          "Merge",
          "Cancel"
        );

        if (confirmation !== "Merge") {
          return;
        }

        // Merge the HTTP methods from source file to target file
        await mergeRouteFiles(sourceFilePath, targetFilePath);
      } else {
        // Target dir exists but file doesn't, simply move the file
        ensureDirectoryExists(targetDir);
        fs.copyFileSync(sourceFilePath, targetFilePath);
      }
    } else {
      // Create target directory and copy file
      ensureDirectoryExists(targetDir);
      fs.copyFileSync(sourceFilePath, targetFilePath);
    }

    // Now remove the source file after successful copy
    if (fs.existsSync(sourceFilePath)) {
      fs.unlinkSync(sourceFilePath);
    }

    // Clean up empty directories recursively after moving the file
    // Start from the original source directory to ensure proper cleanup
    if (appDirPath) {
      cleanupEmptyDirectories(originalSourceDir, appDirPath);
    }

    // Refresh the routes tree view
    vscode.commands.executeCommand("nextjs-navigator.refreshRoutes");

    // Open the file in editor
    const document = await vscode.workspace.openTextDocument(targetFilePath);
    await vscode.window.showTextDocument(document);

    vscode.window.showInformationMessage(
      `Route renamed from '${currentPath}' to '${input}' successfully`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to rename route: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Helper function to merge HTTP methods from source to target route files
async function mergeRouteFiles(
  sourceFilePath: string,
  targetFilePath: string
): Promise<void> {
  const sourceContent = fs.readFileSync(sourceFilePath, "utf8");
  const targetContent = fs.readFileSync(targetFilePath, "utf8");

  const sourceLines = sourceContent.split("\n");
  const targetLines = targetContent.split("\n");

  // Find imports in source file that need to be added to target
  const sourceImports: string[] = [];
  const methodsToAdd: string[] = [];

  let currentMethod = "";
  let methodContent = "";
  let collectingMethod = false;
  let braceCount = 0;

  // Extract imports from source file
  for (const line of sourceLines) {
    if (line.trim().startsWith("import ") && line.includes("from ")) {
      sourceImports.push(line);
    }
  }

  // Extract methods from source file
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];

    // Check for method declaration
    for (const method of HTTP_METHODS) {
      const arrowFunctionPattern = new RegExp(
        `export\\s+(const|async\\s+const)\\s+${method}\\s*=`,
        "i"
      );
      const functionDeclPattern = new RegExp(
        `export\\s+(async\\s+)?function\\s+${method}\\s*\\(`,
        "i"
      );

      if (arrowFunctionPattern.test(line) || functionDeclPattern.test(line)) {
        collectingMethod = true;
        currentMethod = method;
        methodContent = line;

        // Count opening braces
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        // If method definition is a one-liner
        if (braceCount === 0 && line.includes("=>") && line.includes(";")) {
          methodsToAdd.push(methodContent);
          collectingMethod = false;
        }
        break;
      }
    }

    // Continue collecting multi-line method
    if (collectingMethod && i > 0) {
      methodContent += "\n" + line;

      // Update brace count
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      // End of method reached
      if (braceCount === 0) {
        methodsToAdd.push(methodContent);
        collectingMethod = false;
      }
    }
  }

  // Check if methods already exist in target file
  let updatedTargetContent = targetContent;

  // Add any imports from source that aren't in target
  for (const importStatement of sourceImports) {
    if (!updatedTargetContent.includes(importStatement)) {
      // Add import to the top, after other existing imports
      const lastImportIndex = getLastImportIndex(targetLines);
      if (lastImportIndex >= 0) {
        targetLines.splice(lastImportIndex + 1, 0, importStatement);
      } else {
        targetLines.unshift(importStatement);
      }
      updatedTargetContent = targetLines.join("\n");
    }
  }

  // Add methods if they don't already exist
  for (const methodCode of methodsToAdd) {
    const methodName = getMethodNameFromCode(methodCode);
    if (methodName && !hasMethodDefinition(updatedTargetContent, methodName)) {
      updatedTargetContent += "\n\n" + methodCode;
    }
  }

  fs.writeFileSync(targetFilePath, updatedTargetContent);
}

// Helper function to ensure a directory exists
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper function to get the relative path from app dir to the route directory
function getRelativePathFromAppDir(
  appDirPath: string,
  routeDirPath: string
): string {
  return path.relative(appDirPath, path.dirname(routeDirPath));
}

// Helper function to calculate the depth of a route path
function getRoutePathDepth(routePath: string): number {
  return routePath === "/" ? 0 : routePath.split("/").filter(Boolean).length;
}

// Helper function to get the last import statement index
function getLastImportIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith("import ")) {
      return i;
    }
  }
  return -1;
}

// Helper to extract method name from code
function getMethodNameFromCode(code: string): string | null {
  for (const method of HTTP_METHODS) {
    if (
      new RegExp(
        `export\\s+(async\\s+)?(const\\s+${method}\\s*=|function\\s+${method}\\s*\\()`,
        "i"
      ).test(code)
    ) {
      return method;
    }
  }
  return null;
}

// Helper to check if a method already exists in content
function hasMethodDefinition(content: string, methodName: string): boolean {
  return new RegExp(
    `export\\s+(async\\s+)?(const\\s+${methodName}\\s*=|function\\s+${methodName}\\s*\\()`,
    "i"
  ).test(content);
}

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    // Create the tree view but with a helpful message for no workspace
    const provider = new NextJsRoutesProvider();
    const treeView = vscode.window.createTreeView("nextjsRoutes", {
      treeDataProvider: provider,
    });

    // Register all commands with appropriate error messages
    registerAllCommandsWithErrorHandling(context);
    context.subscriptions.push(treeView);
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const isNextProject = isNextJsProject(rootPath);
  const hasAppRouter = hasAppDirectory(rootPath);

  // Still create tree view even if not a Next.js project, but with helpful messages
  const nextJsRoutesProvider = new NextJsRoutesProvider();
  const treeView = vscode.window.createTreeView("nextjsRoutes", {
    treeDataProvider: nextJsRoutesProvider,
  });

  // Register all commands regardless, but they'll check for valid project context at runtime
  registerAllCommands(context, nextJsRoutesProvider, treeView);

  // Only set up file watchers if it's a valid project
  if (isNextProject && hasAppRouter) {
    setupFileWatchers(context, nextJsRoutesProvider);
  }
}

// New function to register all commands for any project context
function registerAllCommandsWithErrorHandling(
  context: vscode.ExtensionContext
) {
  // Register base commands that show appropriate error messages
  context.subscriptions.push(
    vscode.commands.registerCommand("nextjs-navigator.refreshRoutes", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.expandAll", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.collapseAll", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.addRoute", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.addChildRoute", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.copyRoute", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.copyFilePath", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.deleteRoute", () => {
      showNextJsProjectRequiredMessage();
    }),
    vscode.commands.registerCommand("nextjs-navigator.renameRoute", () => {
      showNextJsProjectRequiredMessage();
    })
  );
}

// Helper function to provide a consistent, helpful error message
function showNextJsProjectRequiredMessage() {
  vscode.window
    .showErrorMessage(
      "This feature requires a Next.js App Router project. Open a project with Next.js in package.json and an 'app' directory.",
      "Learn More"
    )
    .then((selection) => {
      if (selection === "Learn More") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://nextjs.org/docs/app")
        );
      }
    });
}

// New function to register all commands with proper implementation
function registerAllCommands(
  context: vscode.ExtensionContext,
  nextJsRoutesProvider: NextJsRoutesProvider,
  treeView: vscode.TreeView<RouteNode>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("nextjs-navigator.refreshRoutes", () => {
      if (isValidNextJsProject()) {
        nextJsRoutesProvider.refresh();
      } else {
        showNextJsProjectRequiredMessage();
      }
    }),
    vscode.commands.registerCommand("nextjs-navigator.expandAll", async () => {
      if (isValidNextJsProject()) {
        const routes = await nextJsRoutesProvider.getChildren();
        for (const route of routes) {
          await treeView.reveal(route, {
            expand: true,
            focus: false,
            select: false,
          });
        }
      } else {
        showNextJsProjectRequiredMessage();
      }
    }),
    vscode.commands.registerCommand("nextjs-navigator.collapseAll", () => {
      if (isValidNextJsProject()) {
        vscode.commands.executeCommand(
          "workbench.actions.treeView.nextjsRoutes.collapseAll"
        );
      } else {
        showNextJsProjectRequiredMessage();
      }
    }),
    vscode.commands.registerCommand("nextjs-navigator.addRoute", () => {
      if (!isValidNextJsProject()) {
        showNextJsProjectRequiredMessage();
        return;
      }

      if (nextJsRoutesProvider.appDirPath) {
        createNewRoute(nextJsRoutesProvider.appDirPath);
      } else {
        vscode.window.showErrorMessage(
          "App directory not found. Make sure you have 'app' or 'src/app' directory in your Next.js project."
        );
      }
    }),
    // Register remaining commands with similar validation logic
    vscode.commands.registerCommand(
      "nextjs-navigator.addChildRoute",
      (node: RouteNode) => {
        if (!isValidNextJsProject()) {
          showNextJsProjectRequiredMessage();
          return;
        }

        if (!nextJsRoutesProvider.appDirPath) {
          vscode.window.showErrorMessage(
            "App directory not found. Make sure you have 'app' or 'src/app' directory in your Next.js project."
          );
          return;
        }

        if (!node || !node.routePath) {
          vscode.window.showErrorMessage(
            "Could not determine parent route path. Please try selecting a route first."
          );
          return;
        }

        createNewRoute(nextJsRoutesProvider.appDirPath, node.routePath);
      }
    ),
    vscode.commands.registerCommand(
      "nextjs-navigator.copyRoute",
      (node: RouteNode) => {
        if (!isValidNextJsProject()) {
          showNextJsProjectRequiredMessage();
          return;
        }

        if (!node || !node.routePath) {
          vscode.window.showErrorMessage(
            "No route path available to copy. Please select a valid route."
          );
          return;
        }

        vscode.env.clipboard.writeText(node.routePath);
        vscode.window.showInformationMessage(
          `Route path '${node.routePath}' copied to clipboard`
        );
      }
    ),
    vscode.commands.registerCommand(
      "nextjs-navigator.copyFilePath",
      (node: RouteNode) => {
        if (!isValidNextJsProject()) {
          showNextJsProjectRequiredMessage();
          return;
        }

        if (!node || !node.filePath) {
          vscode.window.showErrorMessage(
            "No file path available to copy. Please select a valid route."
          );
          return;
        }

        // Get workspace-relative path for better usability
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const rootPath = workspaceFolders[0].uri.fsPath;
          const relativePath = path.relative(rootPath, node.filePath);
          vscode.env.clipboard.writeText(relativePath);
          vscode.window.showInformationMessage(
            `File path '${relativePath}' copied to clipboard`
          );
        } else {
          vscode.env.clipboard.writeText(node.filePath);
          vscode.window.showInformationMessage(`File path copied to clipboard`);
        }
      }
    ),
    vscode.commands.registerCommand(
      "nextjs-navigator.deleteRoute",
      (node: RouteNode) => {
        if (!isValidNextJsProject()) {
          showNextJsProjectRequiredMessage();
          return;
        }

        if (!node) {
          vscode.window.showErrorMessage(
            "No route selected. Please select a route to delete."
          );
          return;
        }

        if (!node.filePath || !node.routePath) {
          vscode.window.showErrorMessage(
            "Cannot delete route: missing file path or route path information."
          );
          return;
        }

        deleteRoute(node.filePath, node.routePath);
      }
    ),
    vscode.commands.registerCommand(
      "nextjs-navigator.renameRoute",
      (node: RouteNode) => {
        if (!isValidNextJsProject()) {
          showNextJsProjectRequiredMessage();
          return;
        }

        if (!nextJsRoutesProvider.appDirPath) {
          vscode.window.showErrorMessage(
            "App directory not found. Make sure you have 'app' or 'src/app' directory in your Next.js project."
          );
          return;
        }

        if (!node) {
          vscode.window.showErrorMessage(
            "No route selected. Please select a route to rename."
          );
          return;
        }

        renameRoute(nextJsRoutesProvider.appDirPath, node);
      }
    )
  );
}

// Helper function to check if the current project is a valid Next.js project with App Router
function isValidNextJsProject(): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  return isNextJsProject(rootPath) && hasAppDirectory(rootPath);
}

// Set up file watchers for active Next.js projects
function setupFileWatchers(
  context: vscode.ExtensionContext,
  nextJsRoutesProvider: NextJsRoutesProvider
) {
  // Improved debounce implementation
  let refreshTimeout: NodeJS.Timeout | undefined;
  const debouncedRefresh = () => {
    clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(
      nextJsRoutesProvider.refresh.bind(nextJsRoutesProvider),
      300
    );
  };

  // Consolidated file watcher with optimized patterns
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/{app,src/app}/**",
    false,
    false,
    false
  );

  // Add a Git watcher to detect when HEAD changes (indicating Git operations)
  const gitWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.git/{HEAD,index}",
    false,
    false,
    false
  );

  watcher.onDidCreate(debouncedRefresh);
  watcher.onDidChange(debouncedRefresh);
  watcher.onDidDelete(debouncedRefresh);

  // Trigger refresh when Git operations occur
  gitWatcher.onDidChange(() => {
    console.log("Git operation detected, refreshing routes");
    setTimeout(nextJsRoutesProvider.refresh.bind(nextJsRoutesProvider), 500);
  });

  context.subscriptions.push(watcher, gitWatcher);
}

export function deactivate() {
  // Explicit cleanup not needed as vscode handles disposal of registered objects
}

enum RouteNodeType {
  Route,
  HttpMethod,
  Error, // Add a new node type for error messages
}

class RouteNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: RouteNodeType,
    public readonly filePath?: string,
    public readonly children: RouteNode[] = [],
    public readonly lineNumber?: number,
    public readonly routePath?: string,
    public parent?: RouteNode,
    public readonly routeType?: string,
    public readonly httpMethod?: string
  ) {
    super(label, collapsibleState);

    if (filePath && type === RouteNodeType.HttpMethod) {
      this.command = {
        command: "vscode.open",
        arguments: [
          vscode.Uri.file(filePath),
          lineNumber !== undefined
            ? { selection: new vscode.Range(lineNumber, 0, lineNumber, 0) }
            : undefined,
        ],
        title: "Open File",
      };
    }

    switch (type) {
      case RouteNodeType.Route:
        if (routeType === "error") {
          // Special styling for error messages
          this.iconPath = new vscode.ThemeIcon("warning");
          this.tooltip =
            "This extension requires a Next.js project with App Router. Make sure you have 'app' or 'src/app' directory and next.js in your package.json dependencies.";
          this.contextValue = "error";
        } else {
          this.contextValue = "route";

          // Set different icons based on route type
          if (routeType === "dynamic") {
            this.iconPath = new vscode.ThemeIcon("symbol-parameter");
          } else if (routeType === "catchAll") {
            this.iconPath = new vscode.ThemeIcon("references");
          } else {
            this.iconPath = new vscode.ThemeIcon("link");
          }

          this.tooltip = `${routePath} (${filePath})`;
        }
        break;
      // ...existing cases...
    }
  }
}

class NextJsRoutesProvider implements vscode.TreeDataProvider<RouteNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootPath?: string;
  public appDirPath?: string;
  private visitedDirs = new Set<string>();
  private routes: RouteNode[] = [];

  constructor() {
    this.findAppDirectory();
    this.scanAllRoutes();
  }

  refresh(): void {
    this.visitedDirs.clear();
    this.routes = [];
    this.findAppDirectory();

    // Add cleanup of orphaned directories before scanning routes
    if (this.appDirPath) {
      cleanupOrphanedDirectories(this.appDirPath);
    }

    this.scanAllRoutes();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RouteNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RouteNode): Promise<RouteNode[]> {
    if (!this.rootPath || !this.appDirPath) {
      // Modified message to be more helpful and specific
      return [this.createErrorNode("No Next.js App Router project detected")];
    }

    if (!element) return this.routes;
    return element.children;
  }

  // New helper method to create an error message node
  private createErrorNode(message: string): RouteNode {
    return new RouteNode(
      message,
      vscode.TreeItemCollapsibleState.None,
      RouteNodeType.Route,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      "error"
    );
  }

  getParent(element: RouteNode): vscode.ProviderResult<RouteNode> {
    return element.parent;
  }

  private findAppDirectory(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    this.rootPath = workspaceFolders[0].uri.fsPath;

    // Try "app" first, then "src/app"
    const appDir = path.join(this.rootPath, "app");
    if (fs.existsSync(appDir)) {
      this.appDirPath = appDir;
    } else {
      const srcAppDir = path.join(this.rootPath, "src", "app");
      if (fs.existsSync(srcAppDir)) {
        this.appDirPath = srcAppDir;
      }
    }
  }

  private scanAllRoutes(): void {
    if (!this.appDirPath || !fs.existsSync(this.appDirPath)) return;

    this.visitedDirs.clear();
    this.routes = [];
    this.findRouteFiles(this.appDirPath, "");
    this.routes.sort((a, b) => a.label.localeCompare(b.label));
  }

  private findRouteFiles(
    dirPath: string,
    routePath: string,
    parent?: RouteNode
  ): void {
    if (!fs.existsSync(dirPath)) return;

    // Use canonical paths to avoid duplicates
    const canonicalPath = fs.realpathSync(dirPath);
    if (this.visitedDirs.has(canonicalPath)) return;
    this.visitedDirs.add(canonicalPath);

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      let routeFile: fs.Dirent | undefined;

      // First scan for route files and process directories
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip system directories and private folders (starting with _)
          if (
            ["node_modules", ".next", ".git"].includes(entry.name) ||
            entry.name.startsWith("_")
          )
            continue;

          // Handle route groups (parentheses notation)
          if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
            // Route groups don't affect the URL path
            this.findRouteFiles(entryPath, routePath, parent);
          } else {
            // Handle different types of route segments
            let segmentName = entry.name;
            let newRoutePath = routePath;

            if (newRoutePath && !newRoutePath.endsWith("/")) {
              newRoutePath += "/";
            }

            // Determine the display name and path based on segment type
            if (entry.name.startsWith("[...") && entry.name.endsWith("]")) {
              // Catch-all route segment
              const paramName = entry.name.substring(4, entry.name.length - 1);
              segmentName = `[...${paramName}]`;
              newRoutePath += segmentName;
            } else if (
              entry.name.startsWith("[[...") &&
              entry.name.endsWith("]]")
            ) {
              // Optional catch-all route segment
              const paramName = entry.name.substring(5, entry.name.length - 2);
              segmentName = `[[...${paramName}]]`;
              newRoutePath += segmentName;
            } else if (entry.name.startsWith("[") && entry.name.endsWith("]")) {
              // Dynamic route segment
              newRoutePath += entry.name;
            } else {
              // Regular route segment
              newRoutePath += entry.name;
            }

            this.findRouteFiles(entryPath, newRoutePath, parent);
          }
        } else if (this.isRouteFile(entry.name)) {
          routeFile = entry;
        }
      }

      // Process route file if found
      if (routeFile) {
        const filePath = path.join(dirPath, routeFile.name);
        const displayPath = routePath || "/";
        const methods = this.scanRouteHandlerMethods(filePath);

        if (methods.length > 0) {
          // Determine route type for proper icon display
          const isRootRoute = displayPath === "/";
          const isDynamicRoute = displayPath.includes("[");
          const isCatchAllRoute = displayPath.includes("[...");

          const routeType = isDynamicRoute
            ? isCatchAllRoute
              ? "catchAll"
              : "dynamic"
            : "static";

          const routeNode = new RouteNode(
            displayPath,
            vscode.TreeItemCollapsibleState.Collapsed,
            RouteNodeType.Route,
            filePath,
            methods,
            undefined,
            displayPath,
            parent,
            routeType
          );

          methods.forEach((method) => {
            method.parent = routeNode;
          });

          this.routes.push(routeNode);
        }
      }
    } catch (error) {
      console.error(`Error processing directory ${dirPath}: ${error}`);
    }
  }

  private isRouteFile(filename: string): boolean {
    return /^route\.(js|ts|jsx|tsx)$/.test(filename);
  }

  private scanRouteHandlerMethods(filePath: string): RouteNode[] {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const nodes: RouteNode[] = [];
      const lines = content.split("\n");

      // More efficient scanning - check each line once
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for HTTP method exports
        for (const method of HTTP_METHODS) {
          // Updated regex to match both arrow functions and function declarations
          // Handles both export const GET = ... and export async function GET() formats
          if (
            new RegExp(
              `export\\s+(async\\s+)?((const\\s+${method}\\s*=)|(function\\s+${method}\\s*\\())`,
              "i"
            ).test(line)
          ) {
            nodes.push(
              new RouteNode(
                method,
                vscode.TreeItemCollapsibleState.None,
                RouteNodeType.HttpMethod,
                filePath,
                [],
                i,
                undefined,
                undefined,
                undefined,
                method
              )
            );
            break; // Found method on this line, no need to check others
          }
        }
      }

      return nodes;
    } catch (error) {
      console.error(`Error scanning route handler ${filePath}: ${error}`);
      return [];
    }
  }
}
