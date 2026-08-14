# TM17 ASRS

Next.js application for survey submission, reporting, and administrative workflows. The application uses PostgreSQL for persistent data.

## Getting Started: Installation & Setup

Before running the TM17 ASRS platform, you'll need to install the following prerequisites and configure your database. 
- Node.js 22 or newer
- PostgreSQL 14 or newer, running locally or reachable over the network
- Brew & npm for package installation

### 1. Install Node.js

Install **Node.js 22 or newer**. Verify your version with:
```bash
node -v
```
If you need to install or upgrade, download it from [nodejs.org](https://nodejs.org) or use a version manager like `nvm`.

### 2. Install PostgreSQL

Install **PostgreSQL 14 or newer**, either locally or have access to a remotely hosted instance. Verify your version with:
```bash
psql --version
```
If it's not installed, get it from [postgresql.org](https://www.postgresql.org/download/) or via your system's package manager (e.g., `brew install postgresql` on macOS, `apt install postgresql` on Ubuntu).

### 3. Install Project Dependencies

Once Node.js is ready, install the application's required libraries by running the following from the project root:
```bash
npm install
```
This reads the project's `package.json` and pulls in all Next.js and other library dependencies needed to run the platform.

## PostgreSQL setup

Start up PostgreSQL:

```bash
brew services start postgresql@18
```

Connect to the PostgreSQL DB:
```bash
psql postgresql://asrs:change-me@localhost:5432/asrs
```
Create an application user and database. From a PostgreSQL administrator shell:

```sql
CREATE USER asrs WITH PASSWORD 'change-me';
CREATE DATABASE asrs OWNER asrs;
```

Create `.env.local` in the project root (or copy `.env.example`) and set the connection string:

```env
DATABASE_URL=postgresql://asrs:change-me@localhost:5432/asrs
```

For a managed database that requires TLS, add `?sslmode=require` to the URL:

```env
DATABASE_URL=postgresql://asrs:change-me@db.example.com:5432/asrs?sslmode=require
```

Do not commit `.env.local` or a real password.

## Initialize the database with data

Schema and seed data are applied explicitly; the application does not create or
alter database objects during startup.

```bash
npm run db:setup
```

This runs [`database/schema.sql`](database/schema.sql) followed by
[`database/seed.sql`](database/seed.sql). Run it once for a new, empty database.
The seed creates an administrator account:

Change this temporary password after signing in.

## Launch Platform locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful commands

```bash
npm run dev    # development server
npm run db:setup # initialize a new, empty database
npm run build  # production build
npm run start  # serve a production build
npm test       # test suite
npm run lint   # lint source files
```

## Deployment

Set `DATABASE_URL` in the deployment provider's server-side environment configuration before starting the application. The database user needs permission to create and alter the application tables during initialization.
