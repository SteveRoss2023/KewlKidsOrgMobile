# PostgreSQL Setup Guide

PostgreSQL is **REQUIRED** for development of this project.

## Installation

### Windows
1. Download PostgreSQL 15+ from https://www.postgresql.org/download/windows/
2. Run the installer and follow the setup wizard
3. Remember the password you set for the `postgres` superuser
4. PostgreSQL service should start automatically

### macOS
```bash
# Using Homebrew
brew install postgresql@15
brew services start postgresql@15
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install postgresql-15 postgresql-contrib
sudo systemctl start postgresql
```

## Database Setup

1. **Connect to PostgreSQL**:
   ```bash
   # Windows (use Command Prompt or PowerShell)
   psql -U postgres
   
   # Mac/Linux
   sudo -u postgres psql
   ```

2. **Create database and user**:
   ```sql
   -- Create database
   CREATE DATABASE kewlkidsorganizer_mobile;
   
   -- Create user
   CREATE USER kewlkids_user WITH PASSWORD 'your_secure_password';
   
   -- Grant privileges
   GRANT ALL PRIVILEGES ON DATABASE kewlkidsorganizer_mobile TO kewlkids_user;
   ALTER DATABASE kewlkidsorganizer_mobile OWNER TO kewlkids_user;
   
   -- Exit psql
   \q
   ```

3. **Enable pgcrypto extension**:
   ```bash
   # Connect to the new database
   psql -U kewlkids_user -d kewlkidsorganizer_mobile
   ```
   
   ```sql
   -- Enable extension
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   
   -- Verify extension is installed
   \dx
   
   -- Exit
   \q
   ```

## Environment Configuration

Create or update `backend/.env` file with your database credentials:

```env
DATABASE_NAME=kewlkidsorganizer_mobile
DATABASE_USER=kewlkids_user
DATABASE_PASSWORD=your_secure_password
DATABASE_HOST=localhost
DATABASE_PORT=5432
```

## Verify Connection

Test the connection from Django:

```bash
cd backend
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Mac/Linux

python manage.py dbshell
```

If you can connect, you should see the PostgreSQL prompt. Type `\q` to exit.

## Running Migrations

After PostgreSQL is set up, run Django migrations:

```bash
cd backend
venv\Scripts\activate  # Windows
python manage.py migrate
```

## Troubleshooting

### Connection refused
- Ensure PostgreSQL service is running
- Check that the port (default 5432) is not blocked by firewall
- Verify DATABASE_HOST in `.env` is correct

### Authentication failed
- Verify DATABASE_USER and DATABASE_PASSWORD in `.env`
- Check that the user has proper permissions

### Database does not exist
- Run the CREATE DATABASE command again
- Verify DATABASE_NAME in `.env` matches the created database

### Extension error
- Ensure you're connected to the correct database
- Check that the user has CREATE privileges


