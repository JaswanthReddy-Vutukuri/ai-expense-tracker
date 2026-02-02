# Expense Tracker Backend

A complete, production-ready RESTful API for an Expense Tracker application built with Node.js, Express, and SQLite.

## Features
- **JWT Authentication**: Secure login and registration.
- **Expense CRUD**: Full management of daily expenses.
- **Dashboard Summary**: Real-time spending analytics and category breakdowns.
- **Input Validation**: Robust data validation using `express-validator`.
- **Database**: Lightweight SQLite integration with async architecture.
- **Swagger Documentation**: Interactive API documentation at `/api-docs`.
- **Error Handling**: Centralized middleware for handling application errors.

## Prerequisites
- Node.js (v18.0.0 or higher)
- npm or yarn

## Installation

1.  **Clone the project**
2.  **Install dependencies**:
    npm install

3.  **Environment Setup**:
    The application comes with a default `.env` file, but you can customize it:
    cp .env.example .env

4.  **Initialize Database**:
    Run the seed script to create tables and add demo data:
    npm run seed

## Running the Application

### Development mode
Run with hot-reloading:
    npm run dev

### Production mode
Run the compiled-ready code:
    npm start

## API Documentation
Once the server is running, visit:
`http://localhost:3000/api-docs`

## Usage Examples

### 1. Login to get a Token
`POST /api/auth/login`
Body:
    {
      "email": "demo@example.com",
      "password": "password123"
    }

### 2. Create an Expense
`POST /api/expenses`
Headers: `Authorization: Bearer <your_token>`
Body:
    {
      "amount": 45.99,
      "category_id": 1,
      "description": "Weekly Groceries",
      "date": "2023-11-20"
    }

## Project Structure
- `src/controllers`: Logic for handling requests.
- `src/database`: SQLite connection and schema setup.
- `src/middlewares`: Auth and Error handling logic.
- `src/routes`: API endpoint definitions.
- `src/validators`: Request body validation rules.
- `src/app.js`: Express application configuration.
- `src/index.js`: Server entry point.

## Troubleshooting
- **Database locked**: Ensure only one process is trying to write to `database.sqlite` at a time.
- **Port already in use**: Change the `PORT` in your `.env` file.
- **Module not found**: Ensure you have run `npm install`.
