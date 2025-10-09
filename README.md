# Plan My Journey - Backend API

A comprehensive Node.js + Express + Prisma + MySQL backend for the Plan My Journey travel planning platform.

## 🚀 Features

### Core Features

- **User Authentication**: JWT-based authentication with role-based access control (User/Admin)
- **Trip Planning**: Create, manage, and track trips with full CRUD operations
- **Travel Pooling**: Create and join group trips with approval workflow
- **Bus Management**: Browse buses, check availability, and book seats
- **Hotel Management**: Search hotels, view available rooms, and make bookings
- **Booking System**: Complete booking flow for buses and hotel rooms
- **Package Management**: Admin-created travel packages combining bus and hotel
- **Analytics**: Comprehensive analytics and reporting endpoints

### Admin Features

- User management with role updates
- Approve/reject pool group join requests
- Create and manage buses, hotels, and packages
- View all bookings and pool groups
- Dashboard with complete statistics

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL
- **ORM**: Prisma
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **CORS**: cors
- **Environment Variables**: dotenv

## 📁 Project Structure

```
pmj-backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.js                # Database seeding script
├── src/
│   ├── controllers/           # Route controllers
│   │   ├── authController.js
│   │   ├── tripController.js
│   │   ├── poolingController.js
│   │   ├── busController.js
│   │   ├── hotelController.js
│   │   ├── bookingController.js
│   │   ├── packageController.js
│   │   ├── analyticsController.js
│   │   └── adminController.js
│   ├── routes/                # API routes
│   │   ├── auth.routes.js
│   │   ├── trip.routes.js
│   │   ├── pooling.routes.js
│   │   ├── bus.routes.js
│   │   ├── hotel.routes.js
│   │   ├── booking.routes.js
│   │   ├── package.routes.js
│   │   ├── analytics.routes.js
│   │   └── admin.routes.js
│   ├── middleware/            # Custom middleware
│   │   └── auth.js           # JWT authentication & authorization
│   ├── utils/                 # Utility functions
│   │   ├── jwt.js
│   │   ├── responseHandler.js
│   │   └── validation.js
│   └── app.js                 # Express app configuration
├── server.js                  # Server entry point
├── .env                       # Environment variables
├── .env.example              # Example environment variables
├── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MySQL (v8 or higher)
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   cd pmj-backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Setup MySQL Database**

   ```bash
   # Create database
   mysql -u root -p
   CREATE DATABASE plan_my_journey;
   EXIT;
   ```

4. **Configure Environment Variables**

   Create a `.env` file (or use the existing one) with:

   ```env
   DATABASE_URL="mysql://root:password@localhost:3306/plan_my_journey"
   PORT=5000
   NODE_ENV=development
   JWT_SECRET=your_jwt_secret_key
   JWT_EXPIRE=7d
   FRONTEND_URL=http://localhost:5173
   ```

5. **Run Prisma Migrations**

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

6. **Seed the Database** (Optional but recommended)

   ```bash
   npm run prisma:seed
   ```

7. **Start the Server**

   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

The server will start on `http://localhost:5000`

## 📚 API Documentation

### Base URL

```
http://localhost:5000/api
```

### Authentication

All protected routes require JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### API Endpoints

#### **Authentication** (`/api/auth`)

- `POST /register` - Register new user
- `POST /login` - Login user
- `GET /me` - Get current user profile (Protected)
- `PUT /profile` - Update user profile (Protected)
- `PUT /password` - Change password (Protected)
- `POST /logout` - Logout user

#### **Trips** (`/api/trips`)

- `POST /` - Create new trip (Protected)
- `GET /` - Get all user trips with filters (Protected)
- `GET /:id` - Get trip by ID (Protected)
- `PUT /:id` - Update trip (Protected)
- `DELETE /:id` - Delete trip (Protected)
- `GET /stats/overview` - Get trip statistics (Protected)

#### **Pool Groups** (`/api/pooling`)

- `POST /` - Create pool group (Protected)
- `GET /` - Get all pool groups with filters (Protected)
- `GET /:id` - Get pool group by ID (Protected)
- `POST /:id/join` - Join pool group (Protected)
- `PATCH /:groupId/members/:memberId` - Approve/reject member (Protected)
- `DELETE /:groupId/leave` - Leave pool group (Protected)
- `DELETE /:id` - Delete pool group (Protected)
- `GET /my/groups` - Get my pool groups (Protected)

#### **Buses** (`/api/buses`)

- `GET /` - Get all buses with filters (Protected)
- `GET /:id` - Get bus by ID (Protected)
- `GET /:id/seats/available` - Get available seats (Protected)
- `POST /` - Create bus (Admin)
- `PUT /:id` - Update bus (Admin)
- `DELETE /:id` - Delete bus (Admin)

#### **Hotels** (`/api/hotels`)

- `GET /` - Get all hotels with filters (Protected)
- `GET /:id` - Get hotel by ID (Protected)
- `GET /:id/rooms/available` - Get available rooms (Protected)
- `POST /` - Create hotel (Admin)
- `PUT /:id` - Update hotel (Admin)
- `DELETE /:id` - Delete hotel (Admin)

#### **Bookings** (`/api/bookings`)

- `POST /` - Create booking (Protected)
- `GET /` - Get all user bookings (Protected)
- `GET /:id` - Get booking by ID (Protected)
- `PATCH /:id/cancel` - Cancel booking (Protected)
- `PATCH /:id/confirm` - Confirm booking (Admin)

#### **Packages** (`/api/packages`)

- `GET /` - Get all packages with filters (Protected)
- `GET /:id` - Get package by ID (Protected)
- `POST /` - Create package (Admin)
- `PUT /:id` - Update package (Admin)
- `DELETE /:id` - Delete package (Admin)

#### **Analytics** (`/api/analytics`)

- `GET /buses/:busId/available-seats` - Available seats for bus (Protected)
- `GET /hotels/:hotelId/available-rooms` - Available rooms for hotel (Protected)
- `GET /trips/count` - Trips count between dates (Protected)
- `GET /pool-groups/active` - Active pool groups (Protected)
- `GET /trips/:tripId/packages` - Packages for trip (Protected)
- `GET /destinations/groups` - Destination-wise groups (Protected)
- `GET /pool-groups/:groupId/pending-bookings` - Users with pending bookings (Admin)
- `GET /users/registrations` - Registration count (Admin)
- `GET /trips/upcoming-summary` - Upcoming trips summary (Protected)

#### **Admin** (`/api/admin`)

- `GET /dashboard/stats` - Dashboard statistics (Admin)
- `GET /users` - Get all users (Admin)
- `PATCH /users/:userId/role` - Update user role (Admin)
- `GET /bookings` - Get all bookings (Admin)
- `GET /pool-groups` - Get all pool groups (Admin)
- `GET /group-requests/pending` - Get pending requests (Admin)
- `PATCH /group-requests/:requestId/approve` - Approve request (Admin)
- `PATCH /group-requests/:requestId/reject` - Reject request (Admin)

## 🗃️ Database Schema

### Main Entities

- **Users**: User authentication and profile
- **Trips**: Trip planning and management
- **PoolGroups**: Travel pooling groups
- **GroupMembers**: Pool group membership
- **Buses**: Bus inventory
- **BusSeats**: Individual bus seats
- **Hotels**: Hotel inventory
- **HotelRooms**: Individual hotel rooms
- **Bookings**: User bookings
- **Packages**: Admin-created travel packages

## 🔧 Available Scripts

```bash
# Start production server
npm start

# Start development server with nodemon
npm run dev

# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Open Prisma Studio (Database GUI)
npm run prisma:studio

# Seed database with sample data
npm run prisma:seed

# Reset database (WARNING: Deletes all data)
npm run prisma:reset
```

## 🔐 Default Credentials

After running the seed script:

### Admin Account

```
Email: admin@planmyjourney.in
Password: Password@123
```

### Test Users

```
Email: priya@example.com
Password: Password@123

Email: arjun@example.com
Password: Password@123

(Additional users available in seed script)
```

## 📊 Sample Data

The seed script creates:

- 5 Users (1 Admin, 4 Regular Users)
- 3 Buses with seats
- 4 Hotels with rooms
- 4 Sample Trips
- 2 Pool Groups with members
- 3 Travel Packages
- 1 Sample Booking

## 🔒 Security Features

- Password hashing with bcryptjs
- JWT token-based authentication
- Role-based access control (USER/ADMIN)
- Protected routes with middleware
- Input validation
- SQL injection prevention via Prisma

## 🐛 Error Handling

The API uses consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "errors": {} // Optional validation errors
}
```

Success responses:

```json
{
  "success": true,
  "message": "Success message",
  "data": {} // Response data
}
```

## 📝 Environment Variables

| Variable     | Description             | Default               |
| ------------ | ----------------------- | --------------------- |
| DATABASE_URL | MySQL connection string | Required              |
| PORT         | Server port             | 5000                  |
| NODE_ENV     | Environment             | development           |
| JWT_SECRET   | JWT secret key          | Required              |
| JWT_EXPIRE   | JWT expiration time     | 7d                    |
| FRONTEND_URL | Frontend URL for CORS   | http://localhost:5173 |

## 🚀 Deployment

1. Set `NODE_ENV=production` in your environment
2. Update `DATABASE_URL` with production database
3. Set a strong `JWT_SECRET`
4. Run migrations: `npm run prisma:migrate`
5. Start the server: `npm start`

## 📄 License

This project is licensed under the ISC License.

## 👥 Support

For support, email info@planmyjourney.in

---

**Built with ❤️ for Plan My Journey**

