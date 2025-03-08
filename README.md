# Next.js Navigator

## Description

Developing Next.js applications with the App Router can sometimes feel like navigating a maze of files and directories. Keeping track of your API endpoints and UI routes can become challenging, especially in larger projects. **Next.js Navigator** is a VS Code extension designed to solve this problem by providing an intuitive and efficient way to visualize, create, and manage your Next.js App Router routes.

Imagine you're working on an e-commerce platform. You might have routes like `/products/[id]`, `/api/orders`, and `/admin/dashboard`. With Next.js Navigator, you can see all these routes in a clear tree view, navigate directly to the relevant code, and even create new routes with ease.

This powerful tool provides an intuitive tree view in the activity sidebar, making it effortless to browse, create, and manage route handlers in your Next.js application.

## Installation

You can install Next.js Navigator in several ways:

1. **VS Code Marketplace**:
   - Open VS Code
   - Click on the Extensions view icon on the Sidebar (or press `Ctrl+Shift+X` / `Cmd+Shift+X`)
   - Search for "Next.js Navigator"
   - Click on the "Install" button

2. **Quick Open**:
   - Press `Ctrl+P` / `Cmd+P` in VS Code
   - Type `ext install nextjs-navigator` and press `Enter`

3. **VS Code Web Marketplace**:
   - Visit [Next.js Navigator on the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nextjs-navigator)
   - Click "Install" to add it to your VS Code

4. **From VSIX File**:
   - Download the .vsix file
   - In VS Code, go to Extensions view
   - Click on the "..." menu (More Actions) at the top of the Extensions view
   - Select "Install from VSIX..." and choose the downloaded file

After installation, you'll see the Next.js Navigator icon in your activity bar.

## Custom Installation
If you want to build the extension from source:

```bash
# Clone the repository
git clone https://github.com/sushil-kamble/nextjs-route-handler-navigate

# Navigate to project directory
cd nextjs-route-handler-navigate

# Install dependencies
npm install

# Generate VSIX package
npm run vsce:generate
```

This will create a `.vsix` file in your project directory that you can install using VS Code.

## Features

- **Smart Route Discovery**:

  - Automatically detects route handlers in both `app` and `src/app` directories
  - Supports route groups using the (parentheses) notation
  - Intelligently handles dynamic routes `[param]`, catch-all routes `[...param]`, and optional catch-all routes `[[...param]]`
  - Ignores private directories (prefixed with underscore `_`)

- **Comprehensive HTTP Method Support**:

  - Displays all supported HTTP methods: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
  - Visual indicators for different HTTP methods with color-coded icons
  - Direct file navigation with line-specific jumping to method definitions
  - Method-specific tooltips with descriptions

- **Route Management**:

  - Create new routes with `/path/to/route:METHOD` syntax. For example, `/api/users:POST` will create a new POST route at `/api/users`.
  - Add child routes to existing routes
  - Copy route paths to clipboard
  - Copy file paths to clipboard
  - Delete route handlers with confirmation dialog
  - Rename routes with automatic file system updates

- **Visual Features**:

  - Different icons for static routes, dynamic routes, and catch-all routes
  - Tree view structure with collapsible/expandable segments
  - Method-level navigation with precise cursor positioning
  - Tooltips showing complete route information
  - Color-coded method icons for better visibility

- **Real-time Updates**:
  - Automatic refresh when files are created, changed, or deleted
  - Manual refresh option
  - Expand/collapse all routes

## How to Use

1. Open a Next.js project using the App Router architecture
2. Access the "Next.js Navigator" view in the Activity Bar
3. Browse through your routes in the tree view
4. Use the following actions:
   - Click on HTTP methods to jump to their definitions in code
   - Right-click on routes for context menu actions
   - Use the toolbar buttons to refresh, expand all, collapse all, or create new routes
   - Use the path syntax `/path/to/route:METHOD` to create routes with specific HTTP methods

## Commands

All commands are available in the VS Code Command Palette (Ctrl/Cmd + Shift + P):

- `Next.js Navigator: Refresh Routes` - Manually refresh the route list
- `Next.js Navigator: Expand All` - Expand all routes in the tree view
- `Next.js Navigator: Collapse All` - Collapse all routes in the tree view
- `Next.js Navigator: Create Route` - Create a new route

Additionally, the following commands are available in the context menu:

- `Add Child Route` - Add a child route to the selected route
- `Copy Route Path` - Copy the route path to the clipboard
- `Copy File Path` - Copy the file path to the clipboard
- `Delete Route` - Delete the selected route
- `Rename Route` - Rename or move the selected route

## Keyboard Shortcuts

- `Ctrl+Shift+Alt+R` (`Cmd+Shift+Ctrl+R` on Mac) - Create a new route

## Requirements

- Visual Studio Code v1.80.0 or higher
- Next.js project using the App Router architecture

## Contributing

We welcome contributions! Feel free to submit issues or pull requests on our repository.

## License

This extension is available under the MIT License.
