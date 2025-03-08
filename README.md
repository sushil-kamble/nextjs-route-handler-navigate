# Nextjs: Route Handler Navigator

## Description

The **Nextjs: Route Handler Navigator** is a VS Code extension that enhances navigation within Next.js App Router projects. This powerful tool provides an intuitive tree view in the Explorer panel, making it effortless to browse and manage route handlers in your Next.js application.

## Features

- **Smart Route Discovery**: 
  - Automatically detects route handlers in both `app` and `src/app` directories
  - Supports route groups using the (parentheses) notation
  - Ignores non-route directories (node_modules, .git, .next)

- **Comprehensive HTTP Method Support**:
  - Displays all supported HTTP methods: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
  - Visual indicators for different HTTP methods
  - Direct file navigation with line-specific jumping to method definitions

- **Real-time Updates**:
  - Optimized file watching with debounced updates
  - Intelligent refresh system that only updates changed routes
  - Minimal system resource usage

- **Enhanced Navigation Features**:
  - Click-to-navigate to specific route handlers
  - Method-level navigation with precise cursor positioning
  - Full route path display with tooltips
  - Hierarchical route structure visualization

- **User Interface**:
  - Clean and intuitive tree view layout
  - Custom icons for routes and HTTP methods
  - Collapsible/expandable route segments
  - Route grouping for better organization

## Technical Implementation

- **Stack**:
  - TypeScript for type-safe code
  - VS Code Extension API
  - Node.js file system operations
  - Event-driven architecture

- **Key Solutions**:
  - Efficient file system watching using VS Code's FileSystemWatcher
  - Debounced refresh mechanism to prevent excessive updates
  - Canonical path resolution to avoid duplicates
  - Optimized route scanning with minimal file reads
  - Memory-efficient route tree structure

## Usage

1. Install the extension from the VS Code Marketplace
2. Open a Next.js project using the App Router architecture
3. Access the "Next.js Routes" view in the Explorer panel
4. Navigate through your routes:
   - Click on routes to expand/collapse
   - Click on HTTP methods to jump to their definitions
   - Use the context menu for additional actions

## Commands

Access these commands through the Command Palette (Ctrl/Cmd + Shift + P):

- `Nextjs: Route Handler Navigate: Refresh Routes` - Manually refresh the route list

## Performance Considerations

- Implements lazy loading for route scanning
- Uses caching to prevent unnecessary file operations
- Optimized file watching patterns
- Debounced updates to prevent refresh spam

## Contributing

We welcome contributions! To contribute:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request with detailed description
4. Follow the existing code style

## License

[MIT License] - See LICENSE file for details

## Support

If you encounter any issues or have suggestions, please file them in the GitHub repository's issue tracker.