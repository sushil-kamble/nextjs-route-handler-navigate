# Nextjs: Route Handler Navigator

## Description

The **Nextjs: Route Handler Navigator** is a VS Code extension that simplifies navigation within Next.js App Router projects. It provides a tree view in the Explorer panel, allowing you to easily browse and access route handlers defined in your `app` directory.

## Features

-   **Route Discovery**: Automatically detects and displays route handlers in your Next.js project.
-   **Method Highlighting**: Shows supported HTTP methods (GET, POST, PUT, DELETE, etc.) for each route.
-   **Easy Navigation**: Click on a route or method to directly open the corresponding file in the editor.
-   **Automatic Refresh**: Automatically updates the route list when changes are made to your project files (configurable).
-   **Expand/Collapse**: Allows you to expand and collapse the route tree for better organization.

## Usage

1.  Install the extension from the VS Code Marketplace.
2.  Open a Next.js project that uses the App Router (`app` directory).
3.  The "Next.js Routes" view will appear in the Explorer panel.
4.  Browse the route tree and click on a route or method to open the corresponding file.

## Configuration

-   `nextjs-navigator.autoRefresh`: Enable or disable automatic route list refreshing (default: true).

## Commands

-   `Nextjs: Route Handler Navigate: Refresh Routes`: Manually refresh the route list.
-   `Nextjs: Route Handler Navigate: Expand All Routes`: Expand all routes in the tree view.
-   `Nextjs: Route Handler Navigate: Collapse All Routes`: Collapse all routes in the tree view.

## Contributing

Contributions are welcome! Please submit a pull request or create an issue to discuss potential changes.

## License

[Your License] - Add your license information here.