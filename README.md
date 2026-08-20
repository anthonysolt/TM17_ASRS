# TM17 ASRS

TM17 ASRS is a Next.js application for creating initiatives and surveys, collecting responses, generating reports, and managing administrative workflows. PostgreSQL provides persistent storage.

## Local requirements

- macOS
- [Homebrew](https://brew.sh/)
- Node.js 22 or newer
- PostgreSQL 14 or newer

The commands below install Node.js 22 and PostgreSQL 18 with Homebrew.

## 1. Install Homebrew

If Homebrew is not already installed, run:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the shell configuration instructions printed by the installer, then verify that Homebrew is available:

```bash
brew --version
```

## 2. Install Node.js and PostgreSQL

```bash
brew update
brew install node@22 postgresql@18
```

Homebrew may install these packages as keg-only. Add them to your shell path:

```bash
echo 'export PATH="$(brew --prefix node@22)/bin:$(brew --prefix postgresql@18)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify the installations:

```bash
node --version
npm --version
psql --version
```

Node should report version 22 or newer. PostgreSQL should report version 14 or newer.

### Optional Apple build tools

If `npm ci` reports a native-module compiler error, install Apple's command-line tools:

```bash
xcode-select --install
```

## 3. Start PostgreSQL

Register PostgreSQL as a background service:

```bash
brew services start postgresql@18
```

Confirm that it is accepting connections:

```bash
pg_isready
```

To stop or restart it later:

```bash
brew services stop postgresql@18
brew services restart postgresql@18
```

## 4. Create the local database

Create a dedicated PostgreSQL role and database for the application:

```bash
psql postgres -c "CREATE ROLE asrs WITH LOGIN PASSWORD 'change-me';"
createdb --owner=asrs asrs
```

These commands are intended for the first setup. If the role or database already exists, PostgreSQL will report that instead of recreating it.

Verify the connection:

```bash
psql "postgresql://asrs:change-me@localhost:5432/asrs" -c "SELECT current_database(), current_user;"
```

## 5. Install application dependencies

From the repository root:

```bash
cd /Users/anthonysolt/Desktop/TM17_ASRS
npm ci
```

`npm ci` installs the exact dependency versions recorded in `package-lock.json`.

## 6. Configure the environment

Create `.env.local` in the repository root with the following content:

```env
DATABASE_URL=postgresql://asrs:change-me@localhost:5432/asrs
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Do not commit `.env.local` or real credentials to source control.

### Optional AI insights

Report generation works without OpenAI. To enable AI-generated report insights, add a valid API key:

```env
OPENAI_API_KEY=your-api-key
```

Using this feature may incur OpenAI API charges.

### Optional email delivery

Signup verification and invitation emails use Mailtrap-compatible SMTP settings:

```env
MAILTRAP_HOST=your-smtp-host
MAILTRAP_PORT=587
MAILTRAP_USER=your-smtp-user
MAILTRAP_PASS=your-smtp-password
```

Email configuration is not required for the basic local application startup.

## 7. Initialize and seed the database

Apply the schema and seed records:

```bash
npm run db:setup
```

This command runs `database/schema.sql` followed by `database/seed.sql`.

The seed creates this local administrator account:

```text
Email:    admin@test.com
Password: temporary1!
```

Use this account only for local development. Change or remove the seeded password before using the application in a shared environment.

## 8. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the seeded administrator account.

Stop the development server with `Control-C`.

## Production-mode verification

To test a production build locally:

```bash
npm run build
npm run start
```

The production server also runs at [http://localhost:3000](http://localhost:3000) unless a different port is configured.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the test suite |
| `npm run db:schema` | Apply the database schema |
| `npm run db:seed` | Apply seed data |
| `npm run db:setup` | Apply the schema and seed data |
| `npm run db:fill-mock-data` | Load development mock data |
| `npm run db:remove-mock-data` | Remove development mock data |

## Troubleshooting

### `brew`, `node`, or `psql` is not found

Reload the shell configuration:

```bash
source ~/.zshrc
```

Confirm the package paths:

```bash
brew --prefix node@22
brew --prefix postgresql@18
```

### PostgreSQL is not accepting connections

```bash
brew services restart postgresql@18
pg_isready
```

If it still fails, inspect the service status:

```bash
brew services list
```

### The database role or database already exists

Do not recreate it. Confirm that the existing database is accessible:

```bash
psql "postgresql://asrs:change-me@localhost:5432/asrs"
```

If its password is different, update `DATABASE_URL` in `.env.local` accordingly.

### Database setup reports a permission error

Confirm that the `asrs` role owns the database:

```bash
psql postgres -c "ALTER DATABASE asrs OWNER TO asrs;"
```

Then retry:

```bash
npm run db:setup
```

### Port 3000 is already in use

Run the development server on a different port:

```bash
npm run dev -- -p 3001
```

Then open `http://localhost:3001` and update the local application URL environment variables if URL generation needs to use that port.

## Remote PostgreSQL alternative

When using a remote PostgreSQL server, install the Node.js runtime and PostgreSQL client instead of running PostgreSQL locally:

```bash
brew install node@22 libpq
echo 'export PATH="$(brew --prefix node@22)/bin:$(brew --prefix libpq)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Set `.env.local` to the remote connection URL. Managed databases commonly require TLS:

```env
DATABASE_URL=postgresql://username:password@database-host:5432/asrs?sslmode=require
```

Only run `npm run db:setup` against a new database that is intended for this application.
