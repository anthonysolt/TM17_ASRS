# ASRS Setup Instructions

A comprehensive guide to setting up the ASRS project locally.

## Prerequisites

- Windows Host machine
- Administrative access for VirtualBox and PostgreSQL installation

## Installation Steps

### Step 1: Install VirtualBox

Download VirtualBox from the official website (select the Windows Host version):

[https://www.virtualbox.org/wiki/Downloads](https://www.virtualbox.org/wiki/Downloads)

### Step 2: Download Ubuntu ISO Image

Download the Ubuntu ISO image:

[https://releases.ubuntu.com/noble/](https://releases.ubuntu.com/noble/)

### Step 3: Download TM17 Code

Clone or download the TM17 ASRS repository:

[https://github.com/anthonysolt/TM17_ASRS](https://github.com/anthonysolt/TM17_ASRS)

### Step 4: Install PostgreSQL

Update your system packages:

```bash
sudo apt update
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt update
sudo apt install -y postgresql-18 postgresql-client-18
sudo systemctl start postgresql
```

**Configure Environment Variables:**

Edit the `.env.local` file and add:

```
DATABASE_URL=postgresql://asrs:change-me@localhost:5432/asrs
```

### Step 5: Initialize Database

Connect to PostgreSQL and set up the database:

```bash
sudo -u postgres psql
```

Then execute the following SQL commands:

```sql
CREATE USER asrs WITH PASSWORD 'change-me';
CREATE DATABASE asrs;
GRANT ALL PRIVILEGES ON DATABASE asrs TO asrs;
\c asrs
GRANT ALL ON SCHEMA public TO asrs;
\q
```

Restore the database from backup:

```bash
sudo -u postgres psql -h localhost -U asrs -d asrs < asrs_db.sql
```

### Step 6: Install Node.js and npm

Update system and install Node Version Manager (nvm):

```bash
sudo apt update
sudo apt install curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash
```

Install Node.js and npm:

```bash
nvm install node 26
npm install -g npm@12.0.2
```

### Step 7: Run the Application

Install dependencies and start the development server:

```bash
npm install
npm audit fix --force
npm run dev
```

## Troubleshooting

### Turbopack Error

If you encounter a turbopack error, clear the cache and reinstall:

```bash
rm -rf .next node_modules && npm install
```

## Support

For issues or questions, please open an issue on the [GitHub repository](https://github.com/anthonysolt/TM17_ASRS).

```bash
npm run dev    # development server
npm run db:setup # initialize a new, empty database
npm run build  # production build
npm run start  # serve a production build
npm test       # test suite
npm run lint   # lint source files
```
