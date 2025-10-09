# Plan My Journey - Backend Setup Guide

## 🚀 Quick Start (Step by Step)

### Step 1: Database Setup

1. **Install MySQL** (if not already installed)

   - Windows: Download from [MySQL.com](https://dev.mysql.com/downloads/installer/)
   - Mac: `brew install mysql`
   - Linux: `sudo apt-get install mysql-server`

2. **Create Database**

   ```bash
   mysql -u root -p
   ```

   In MySQL shell:

   ```sql
   CREATE DATABASE plan_my_journey;
   SHOW DATABASES;
   EXIT;
   ```

### Step 2: Configure Environment

1. **Check `.env` file** (already exists in project)

   ```env
   DATABASE_URL="mysql://root:password@localhost:3306/plan_my_journey"
   PORT=5000
   NODE_ENV=development
   JWT_SECRET=pmj_super_secret_jwt_key_2024_change_in_production
   JWT_EXPIRE=7d
   FRONTEND_URL=http://localhost:5173
   ```

2. **Update MySQL credentials** in `.env`
   - Replace `root` with your MySQL username
   - Replace `password` with your MySQL password

### Step 3: Install Dependencies

```bash
# Already done, but if needed:
npm install
```

### Step 4: Setup Prisma & Database

```bash
# 1. Generate Prisma Client
npm run prisma:generate

# 2. Run migrations (creates all tables)
npm run prisma:migrate

# When prompted for migration name, enter: init
```

### Step 5: Seed Database (Optional but Recommended)

```bash
npm run prisma:seed
```

This creates:

- 1 Admin user
- 4 Test users
- 3 Buses with 40-50 seats each
- 4 Hotels with 25-50 rooms each
- 4 Sample trips
- 2 Pool groups
- 3 Travel packages

### Step 6: Start Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Server will start at: **http://localhost:5000**

### Step 7: Test the API

1. **Health Check**

   ```bash
   curl http://localhost:5000/health
   ```

2. **Register a User**

   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test User",
       "email": "test@example.com",
       "password": "Password@123"
     }'
   ```

3. **Login**

   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@planmyjourney.in",
       "password": "Password@123"
     }'
   ```

   Save the `token` from the response!

4. **Test Protected Route**
   ```bash
   curl http://localhost:5000/api/auth/me \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```

## 🔧 Useful Commands

```bash
# View database in browser
npm run prisma:studio

# Reset database (CAUTION: Deletes all data!)
npm run prisma:reset

# Generate Prisma Client after schema changes
npm run prisma:generate

# Create new migration
npm run prisma:migrate
```

## 📊 Default Credentials

### Admin Login

```
Email: admin@planmyjourney.in
Password: Password@123
```

### Test User Login

```
Email: priya@example.com
Password: Password@123
```

## 🐛 Troubleshooting

### Issue: "Cannot connect to database"

**Solution**:

- Check if MySQL is running: `mysql -u root -p`
- Verify DATABASE_URL in `.env` file
- Ensure database `plan_my_journey` exists

### Issue: "Prisma Client not generated"

**Solution**:

```bash
npm run prisma:generate
```

### Issue: "Migration failed"

**Solution**:

- Drop and recreate database:
  ```sql
  DROP DATABASE plan_my_journey;
  CREATE DATABASE plan_my_journey;
  ```
- Run migrations again: `npm run prisma:migrate`

### Issue: "Port 5000 already in use"

**Solution**:

- Change PORT in `.env` file
- Or kill process using port 5000

### Issue: "JWT token invalid"

**Solution**:

- Make sure you're sending token in header: `Authorization: Bearer <token>`
- Token might be expired (default: 7 days)
- Login again to get new token

## 📁 Project Files Checklist

Make sure these files exist:

- ✅ `server.js` - Server entry point
- ✅ `src/app.js` - Express app configuration
- ✅ `prisma/schema.prisma` - Database schema
- ✅ `prisma/seed.js` - Seed script
- ✅ `.env` - Environment variables
- ✅ All controller files in `src/controllers/`
- ✅ All route files in `src/routes/`
- ✅ Middleware in `src/middleware/`
- ✅ Utils in `src/utils/`

## 🎯 Next Steps

1. ✅ Setup complete!
2. 📱 Connect your frontend to `http://localhost:5000/api`
3. 🧪 Test all endpoints using Postman or Thunder Client
4. 📚 Read API documentation in README.md
5. 🚀 Build amazing features!

## 📞 Need Help?

- Check `README.md` for detailed API documentation
- Review Prisma Schema: `prisma/schema.prisma`
- View database: `npm run prisma:studio`
- Check server logs in terminal

---

**Happy Coding! 🎉**

