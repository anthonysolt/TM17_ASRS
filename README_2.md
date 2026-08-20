# TM17 ASRS

Next.js application for survey submission, reporting, and administrative workflows. The application uses PostgreSQL for persistent data.

## Getting Started: Installation & Setup

Before running the TM17 ASRS platform, you'll need to install a couple of prerequisites and configure your database. Here's what to do:

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

## macOS Setup with Homebrew

### Required system tools

Install Node.js and PostgreSQL:

```bash
brew install node@22 postgresql@18
```

If Homebrew marks Node.js as keg-only, add it to your path:

```bash
echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Start PostgreSQL:

```bash
brew services start postgresql@18
```

Verify the installations:

```bash
node --version
npm --version
psql --version
pg_isready
```

This project requires Node.js 22 or newer and PostgreSQL 14 or newer.

### Using a remote PostgreSQL database

If PostgreSQL is hosted remotely, such as on AWS RDS, install only the PostgreSQL client:

```bash
brew install node@22 libpq
```

Add the client tools to your path:

```bash
echo 'export PATH="$(brew --prefix libpq)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Apple build tools

Some native npm dependencies may require Apple's compiler toolchain:

```bash
xcode-select --install
```

### AWS tools

Install the AWS CLI when deploying to AWS or configuring Amazon SES:

```bash
brew install awscli
aws --version
```

Use AWS IAM Identity Center when available:

```bash
aws configure sso
```

Do not commit AWS credentials or `.env.local` to Git.

### Install and run the application

Install the JavaScript dependencies:

```bash
npm ci
```

Create `.env.local`:

```env
DATABASE_URL=postgresql://asrs:change-me@localhost:5432/asrs
```

Initialize a new empty database:

```bash
npm run db:setup
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prerequisites

- Node.js 22 or newer
- PostgreSQL 14 or newer, running locally or reachable over the network

## PostgreSQL setup

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

## Initialize the database

Schema and seed data are applied explicitly; the application does not create or alter database objects during startup.

```bash
npm run db:setup
```

Change this temporary password after signing in.

## Launch locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify the database

Connect with `psql` using the same connection URL:

```bash
psql "$DATABASE_URL"
```

## Useful commands

```bash
npm run dev       # development server
npm run db:setup  # initialize a new, empty database
npm run build     # production build
npm run start     # serve a production build
npm test          # test suite
npm run lint      # lint source files
```

## Deployment

Set `DATABASE_URL` in the deployment provider's server-side environment configuration before starting the application. The database user needs permission to create and alter the application tables during initialization.
