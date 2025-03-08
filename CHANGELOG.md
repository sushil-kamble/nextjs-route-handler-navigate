# Changelog

## 1.2.0

- Added route renaming functionality with method preservation
- Added smart HTTP method merging when renaming to existing routes
- Added method-specific tooltips with descriptions
- Enhanced visual indicators:
  - Color-coded HTTP method icons
  - Distinct icons for static, dynamic, and catch-all routes
- Improved file system operations with better error handling
- Added workspace-relative path support for file path copying

## 1.1.0

- Added new commands for route management:
  - Create new routes with path and HTTP method specification
  - Add child routes to existing routes
  - Copy route paths to clipboard
  - Copy file paths to clipboard
  - Delete routes with confirmation dialog
- Improved visual indicators with different icons for route types (static, dynamic, catch-all)
- Added keyboard shortcut for route creation
- Added support for TypeScript detection for better code generation
- Added tooltips with route information

## 1.0.0

- Initial release of Next.js Navigator
- Features: Route discovery, method highlighting, navigation between routes
- Support for App Router directory structure (app/, src/app/)
- Detection of route groups, dynamic routes, and catch-all routes
