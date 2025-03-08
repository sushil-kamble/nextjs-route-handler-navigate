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

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;

  // Only activate if it's a Next.js project with App Router
  if (!isNextJsProject(rootPath) || !hasAppDirectory(rootPath)) {
    vscode.window.showInformationMessage(
      "NextJS Navigator only active in Next.js projects using the App Router."
    );
    return;
  }

  const nextJsRoutesProvider = new NextJsRoutesProvider();
  const treeView = vscode.window.createTreeView("nextjsRoutes", {
    treeDataProvider: nextJsRoutesProvider,
  });

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

  watcher.onDidCreate(debouncedRefresh);
  watcher.onDidChange(debouncedRefresh);
  watcher.onDidDelete(debouncedRefresh);

  context.subscriptions.push(
    watcher,
    vscode.commands.registerCommand("nextjs-navigator.refreshRoutes", () => {
      nextJsRoutesProvider.refresh();
    }),
    vscode.commands.registerCommand("nextjs-navigator.expandAll", async () => {
      const routes = await nextJsRoutesProvider.getChildren();
      for (const route of routes) {
        await treeView.reveal(route, {
          expand: true,
          focus: false,
          select: false,
        });
      }
    }),
    vscode.commands.registerCommand("nextjs-navigator.collapseAll", () => {
      vscode.commands.executeCommand(
        "workbench.actions.treeView.nextjsRoutes.collapseAll"
      );
    }),
    vscode.commands.registerCommand("nextjs-navigator.addRoute", () => {
      if (nextJsRoutesProvider.appDirPath) {
        createNewRoute(nextJsRoutesProvider.appDirPath);
      } else {
        vscode.window.showErrorMessage(
          "App directory not found. Is this a Next.js project with App Router?"
        );
      }
    }),
    // Add new commands for context menu actions
    vscode.commands.registerCommand(
      "nextjs-navigator.addChildRoute",
      (node: RouteNode) => {
        if (nextJsRoutesProvider.appDirPath && node.routePath) {
          createNewRoute(nextJsRoutesProvider.appDirPath, node.routePath);
        } else {
          vscode.window.showErrorMessage(
            "Could not determine parent route path"
          );
        }
      }
    ),
    vscode.commands.registerCommand(
      "nextjs-navigator.copyRoute",
      (node: RouteNode) => {
        if (node.routePath) {
          vscode.env.clipboard.writeText(node.routePath);
          vscode.window.showInformationMessage(
            `Route path '${node.routePath}' copied to clipboard`
          );
        }
      }
    ),
    vscode.commands.registerCommand(
      "nextjs-navigator.copyFilePath",
      (node: RouteNode) => {
        if (node.filePath) {
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
            vscode.window.showInformationMessage(
              `File path copied to clipboard`
            );
          }
        }
      }
    ),
    vscode.commands.registerCommand(
      "nextjs-navigator.deleteRoute",
      (node: RouteNode) => {
        if (node.filePath && node.routePath) {
          deleteRoute(node.filePath, node.routePath);
        } else {
          vscode.window.showErrorMessage(
            "Cannot delete route: missing file path or route path"
          );
        }
      }
    ),
    treeView
  );
}

export function deactivate() {
  // Explicit cleanup not needed as vscode handles disposal of registered objects
}

enum RouteNodeType {
  Route,
  HttpMethod,
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
        break;
      case RouteNodeType.HttpMethod:
        this.contextValue = "httpMethod";

        // Use method-specific icons and colors
        switch (httpMethod) {
          case "GET":
            this.iconPath = new vscode.ThemeIcon(
              "symbol-method",
              new vscode.ThemeColor("charts.green")
            );
            break;
          case "POST":
            this.iconPath = new vscode.ThemeIcon(
              "add",
              new vscode.ThemeColor("charts.blue")
            );
            break;
          case "PUT":
            this.iconPath = new vscode.ThemeIcon(
              "replace-all",
              new vscode.ThemeColor("charts.orange")
            );
            break;
          case "PATCH":
            this.iconPath = new vscode.ThemeIcon(
              "diff-modified",
              new vscode.ThemeColor("charts.yellow")
            );
            break;
          case "DELETE":
            this.iconPath = new vscode.ThemeIcon(
              "trash",
              new vscode.ThemeColor("charts.red")
            );
            break;
          case "HEAD":
            this.iconPath = new vscode.ThemeIcon(
              "inspect",
              new vscode.ThemeColor("charts.purple")
            );
            break;
          case "OPTIONS":
            this.iconPath = new vscode.ThemeIcon(
              "gear",
              new vscode.ThemeColor("terminal.ansiCyan")
            );
            break;
          default:
            this.iconPath = new vscode.ThemeIcon("symbol-method");
        }

        // Add method-specific tooltips with descriptions
        const methodDescriptions: Record<string, string> = {
          GET: "Retrieves data (Read)",
          POST: "Creates new resources (Create)",
          PUT: "Replaces resources (Update/Replace)",
          PATCH: "Partially modifies resources (Update/Modify)",
          DELETE: "Removes resources (Delete)",
          HEAD: "GET without response body (Header only)",
          OPTIONS: "Describes communication options",
        };

        this.tooltip = httpMethod
          ? `${httpMethod}: ${methodDescriptions[httpMethod] || "HTTP Method"}`
          : "HTTP Method";
        break;
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
    this.scanAllRoutes();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RouteNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RouteNode): Promise<RouteNode[]> {
    if (!this.rootPath || !this.appDirPath) {
      vscode.window.showInformationMessage(
        "No Next.js project found in workspace"
      );
      return [];
    }

    if (!element) return this.routes;
    return element.children;
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
