import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
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
    public parent?: RouteNode
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
        this.iconPath = new vscode.ThemeIcon("link");
        this.tooltip = `${routePath} (${filePath})`;
        break;
      case RouteNodeType.HttpMethod:
        this.contextValue = "httpMethod";
        this.iconPath = new vscode.ThemeIcon("symbol-method");
        this.description = `${label} method`;
        break;
    }
  }
}

class NextJsRoutesProvider implements vscode.TreeDataProvider<RouteNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootPath?: string;
  private appDirPath?: string;
  private visitedDirs = new Set<string>();
  private routes: RouteNode[] = [];

  // HTTP methods to detect
  private static readonly HTTP_METHODS = [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "HEAD",
    "OPTIONS",
  ];

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
          if (["node_modules", ".next", ".git"].includes(entry.name)) continue;

          // Handle route groups (parentheses notation)
          if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
            this.findRouteFiles(entryPath, routePath, parent);
          } else {
            const newRoutePath =
              routePath +
              (routePath && !routePath.endsWith("/") ? "/" : "") +
              entry.name;
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
          const routeNode = new RouteNode(
            displayPath,
            vscode.TreeItemCollapsibleState.Collapsed,
            RouteNodeType.Route,
            filePath,
            methods,
            undefined,
            displayPath,
            parent
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
        for (const method of NextJsRoutesProvider.HTTP_METHODS) {
          if (new RegExp(`export\\s+const\\s+${method}\\s*=`, "i").test(line)) {
            nodes.push(
              new RouteNode(
                method,
                vscode.TreeItemCollapsibleState.None,
                RouteNodeType.HttpMethod,
                filePath,
                [],
                i,
                undefined
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
