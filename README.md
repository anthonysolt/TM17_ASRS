# TM17 ASRS

Next.js application for survey submission, reporting, and administrative workflows. The application uses PostgreSQL for persistent data.

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

Schema and seed data are applied explicitly; the application does not create or
alter database objects during startup.

```bash
npm run db:setup
```

This runs [`database/schema.sql`](database/schema.sql) followed by
[`database/seed.sql`](database/seed.sql). Run it once for a new, empty database.
The seed creates an administrator account:

```text
Username: admin@test.com
Password: temporary1!
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

Then inspect the initialized schema and seeded administrator:

```sql
\dt
SELECT * FROM user_type;
SELECT email, verified FROM "user" WHERE email = 'admin@test.com';
```

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
