# Next.js Navigator - Copilot Instructions

## Project Overview

This is a VS Code extension that provides navigation and management capabilities for Next.js applications using the App Router pattern. The extension focuses on route handling and visualization.

## Core Architecture

- Extension built using VS Code Extension API
- Tree view-based navigation system
- File system watchers for real-time updates
- Event-driven architecture for route management

## Key Components

### Route Management

- Location: `/src/extension.ts`
- Purpose: Core route handling logic
- Key Functions:
  - `createNewRoute`: Creates new route handlers
  - `deleteRoute`: Removes routes and cleans up empty directories
  - `renameRoute`: Renames/moves routes with method preservation
  - `mergeRouteFiles`: Combines HTTP methods when merging routes

### Route Discovery

- Base Directory: `app/` or `src/app/`
- Supported Route Types:
  - Static routes: `app/api/route.ts`
  - Dynamic routes: `app/[param]/route.ts`
  - Catch-all routes: `app/[...param]/route.ts`
  - Optional catch-all: `app/[[...param]]/route.ts`
  - Route groups: `app/(group)/route.ts`

### HTTP Methods

- Supported Methods: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- Format Requirements:
  - Must be exported functions
  - Can be async
  - Must accept Request parameter
  - Should return Response object

## Code Patterns

### Route File Creation
