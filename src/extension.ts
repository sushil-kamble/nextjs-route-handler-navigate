// src/extension.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  const nextJsRoutesProvider = new NextJsRoutesProvider();
  const treeView = vscode.window.createTreeView("nextjsRoutes", {
    treeDataProvider: nextJsRoutesProvider,
  });

  context.subscriptions.push(
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
      // Use the built-in VS Code command for collapsing tree views
      vscode.commands.executeCommand(
        "workbench.actions.treeView.nextjsRoutes.collapseAll"
      );
    }),
    // Register the tree view itself in subscriptions for proper disposal
    treeView
  );
}

export function deactivate() {}

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
    public readonly parent?: RouteNode
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

  // This method is not needed anymore since we're using the built-in collapseAll
  // Keep it for backward compatibility but it should just call the regular refresh
  refreshWithCollapsedState(): void {
    this.refresh();
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
    const possibleAppDirs = [
      path.join(this.rootPath, "app"),
      path.join(this.rootPath, "src", "app"),
    ];

    for (const dir of possibleAppDirs) {
      if (fs.existsSync(dir)) {
        this.appDirPath = dir;
        break;
      }
    }
  }

  private scanAllRoutes(forceCollapsed: boolean = false): void {
    if (!this.appDirPath || !fs.existsSync(this.appDirPath)) return;

    this.visitedDirs.clear();
    this.routes = [];
    this.findRouteFiles(this.appDirPath, "", undefined, forceCollapsed);
    this.routes.sort((a, b) => a.label.localeCompare(b.label));
  }

  private findRouteFiles(
    dirPath: string,
    routePath: string,
    parent?: RouteNode,
    forceCollapsed: boolean = false
  ): void {
    if (!fs.existsSync(dirPath)) return;

    const canonicalPath = fs.realpathSync(dirPath);
    if (this.visitedDirs.has(canonicalPath)) return;
    this.visitedDirs.add(canonicalPath);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (["node_modules", ".next", ".git"].includes(entry.name)) continue;

        let pathSegment = entry.name;
        if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
          this.findRouteFiles(entryPath, routePath, parent);
          continue;
        }

        const newRoutePath =
          routePath +
          (routePath && !routePath.endsWith("/") ? "/" : "") +
          pathSegment;
        this.findRouteFiles(entryPath, newRoutePath, parent);
      } else if (this.isRouteFile(entry.name)) {
        const displayPath = routePath || "/";
        const methods = this.scanRouteHandlerMethods(entryPath);

        if (methods.length > 0) {
          const collapsibleState = forceCollapsed
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.Collapsed; // You can change this to use different default states if needed

          const routeNode = new RouteNode(
            displayPath,
            collapsibleState,
            RouteNodeType.Route,
            entryPath,
            methods,
            undefined,
            displayPath,
            parent
          );

          methods.forEach((method) => {
            (method as any).parent = routeNode;
          });

          this.routes.push(routeNode);
        }
      }
    }
  }

  private isRouteFile(filename: string): boolean {
    return ["route.js", "route.ts", "route.jsx", "route.tsx"].includes(
      filename
    );
  }

  private scanRouteHandlerMethods(filePath: string): RouteNode[] {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const methods = [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "HEAD",
        "OPTIONS",
      ];
      const nodes: RouteNode[] = [];

      for (const method of methods) {
        const regex = new RegExp(`export\\s+const\\s+${method}\\s*=`, "i");
        const match = content.match(regex);

        if (match) {
          const lines = content.split("\n");
          let lineNumber = lines.findIndex((line) => line.match(regex));
          lineNumber = lineNumber >= 0 ? lineNumber : 0;

          nodes.push(
            new RouteNode(
              method,
              vscode.TreeItemCollapsibleState.None,
              RouteNodeType.HttpMethod,
              filePath,
              [],
              lineNumber,
              undefined,
              undefined // Parent will be set later
            )
          );
        }
      }

      return nodes;
    } catch (error) {
      console.error(`Error scanning route handler: ${error}`);
      return [];
    }
  }

  // Remove the collapseAll method since we're using the tree view's built-in collapseAll
}
