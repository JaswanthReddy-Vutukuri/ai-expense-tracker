# Expense Tracker Frontend

A production-ready Angular application for tracking expenses, featuring authentication, data visualization, and full CRUD operations.

## Features
- **JWT Authentication**: Secure login and registration with automatic token handling.
- **Dashboard**: Visualized category breakdown using Chart.js.
- **Expense CRUD**: Full management of expenses with pagination and sorting.
- **Responsive UI**: Built with Angular Material for a modern, mobile-friendly experience.
- **Interceptors**: Global error handling and automatic Bearer token injection.
- **Type-safe Services**: Strictly typed models for API interactions.

## Prerequisites
- **Node.js**: v18.0.0 or higher
- **NPM**: v9.0.0 or higher
- **Backend API**: Expects a running backend at `http://localhost:3000/api` (configurable in `environment.ts`)

## Installation

1.  Clone or download the project files.
2.  Install dependencies:
    `npm install`

## Configuration
The application is pre-configured to communicate with a local backend. Update `src/environments/environment.ts` for different API URLs:

    export const environment = {
      production: false,
      apiUrl: 'http://your-backend-api.com/api'
    };

## Running the Application

1.  Start the development server:
    `npm start`
2.  Open your browser and navigate to:
    `http://localhost:4200`
3.  Register a new account or login with existing credentials.

## Project Structure
- `src/app/auth`: Authentication screens (Login/Register).
- `src/app/dashboard`: Statistics and data visualization.
- `src/app/expenses`: List, Create, and Edit expense screens.
- `src/app/services`: HTTP client wrappers for API communication.
- `src/app/interceptors`: Logic for modifying outgoing requests and handling incoming errors.
- `src/app/models`: Interfaces defining the data structure.

## Troubleshooting
- **Connection Refused**: Ensure your backend server is running and accessible at the URL defined in `environment.ts`.
- **Chart Not Loading**: Ensure the browser Console doesn't show "Canvas" errors; this app uses `ng2-charts` which requires Chart.js registration (handled in `main.ts`).
- **Styles missing**: Ensure `angular.json` correctly imports the Material prebuilt theme.
