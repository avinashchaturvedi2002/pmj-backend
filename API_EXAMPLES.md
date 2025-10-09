# Plan My Journey - API Examples

Complete collection of API examples for testing.

## 🔐 Authentication

### 1. Register User

```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password@123"
}
```

### 2. Login

```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "admin@planmyjourney.in",
  "password": "Password@123"
}
```

**Response**: Save the `token` for authenticated requests!

### 3. Get Current User

```http
GET http://localhost:5000/api/auth/me
Authorization: Bearer YOUR_TOKEN_HERE
```

## ✈️ Trips

### 1. Create Trip

```http
POST http://localhost:5000/api/trips
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "source": "Delhi",
  "destination": "Goa",
  "startDate": "2025-12-01",
  "endDate": "2025-12-06",
  "budget": 25000,
  "travelers": 2
}
```

### 2. Get All My Trips

```http
GET http://localhost:5000/api/trips
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Get Trip by ID

```http
GET http://localhost:5000/api/trips/TRIP_ID_HERE
Authorization: Bearer YOUR_TOKEN_HERE
```

### 4. Update Trip

```http
PUT http://localhost:5000/api/trips/TRIP_ID_HERE
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "budget": 30000,
  "travelers": 3
}
```

## 👥 Pool Groups

### 1. Create Pool Group

```http
POST http://localhost:5000/api/pooling
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "tripId": "TRIP_ID_HERE",
  "groupSize": 4,
  "description": "Looking for travel buddies!"
}
```

### 2. Get All Pool Groups

```http
GET http://localhost:5000/api/pooling?status=OPEN
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Join Pool Group

```http
POST http://localhost:5000/api/pooling/GROUP_ID_HERE/join
Authorization: Bearer YOUR_TOKEN_HERE
```

### 4. Approve Member (Admin/Creator)

```http
PATCH http://localhost:5000/api/pooling/GROUP_ID/members/MEMBER_ID
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "status": "APPROVED"
}
```

## 🚌 Buses

### 1. Get All Buses

```http
GET http://localhost:5000/api/buses?minPrice=500&maxPrice=1500
Authorization: Bearer YOUR_TOKEN_HERE
```

### 2. Get Bus by ID

```http
GET http://localhost:5000/api/buses/BUS_ID_HERE
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Get Available Seats

```http
GET http://localhost:5000/api/buses/BUS_ID_HERE/seats/available
Authorization: Bearer YOUR_TOKEN_HERE
```

### 4. Create Bus (Admin)

```http
POST http://localhost:5000/api/buses
Authorization: Bearer ADMIN_TOKEN_HERE
Content-Type: application/json

{
  "busNumber": "DL01XY1234",
  "busName": "Luxury Volvo",
  "capacity": 40,
  "pricePerSeat": 1000,
  "amenities": "AC, WiFi, Charging Points"
}
```

## 🏨 Hotels

### 1. Get All Hotels

```http
GET http://localhost:5000/api/hotels?location=Goa&minRating=4
Authorization: Bearer YOUR_TOKEN_HERE
```

### 2. Get Hotel by ID

```http
GET http://localhost:5000/api/hotels/HOTEL_ID_HERE
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Get Available Rooms

```http
GET http://localhost:5000/api/hotels/HOTEL_ID_HERE/rooms/available?roomType=Deluxe
Authorization: Bearer YOUR_TOKEN_HERE
```

### 4. Create Hotel (Admin)

```http
POST http://localhost:5000/api/hotels
Authorization: Bearer ADMIN_TOKEN_HERE
Content-Type: application/json

{
  "name": "Beach Paradise Resort",
  "location": "Goa",
  "address": "Calangute Beach, North Goa",
  "totalRooms": 50,
  "pricePerRoom": 3500,
  "rating": 4.5,
  "amenities": "WiFi, Pool, Spa, Restaurant"
}
```

## 📝 Bookings

### 1. Create Booking

```http
POST http://localhost:5000/api/bookings
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "tripId": "TRIP_ID_HERE",
  "busSeatId": "BUS_SEAT_ID_HERE",
  "hotelRoomId": "HOTEL_ROOM_ID_HERE"
}
```

### 2. Get All My Bookings

```http
GET http://localhost:5000/api/bookings
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Get Booking by ID

```http
GET http://localhost:5000/api/bookings/BOOKING_ID_HERE
Authorization: Bearer YOUR_TOKEN_HERE
```

### 4. Cancel Booking

```http
PATCH http://localhost:5000/api/bookings/BOOKING_ID_HERE/cancel
Authorization: Bearer YOUR_TOKEN_HERE
```

## 📦 Packages

### 1. Get All Packages

```http
GET http://localhost:5000/api/packages?isActive=true
Authorization: Bearer YOUR_TOKEN_HERE
```

### 2. Get Package by ID

```http
GET http://localhost:5000/api/packages/PACKAGE_ID_HERE
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Create Package (Admin)

```http
POST http://localhost:5000/api/packages
Authorization: Bearer ADMIN_TOKEN_HERE
Content-Type: application/json

{
  "name": "Goa Beach Package",
  "description": "Complete package with bus and hotel",
  "tripId": "TRIP_ID_HERE",
  "busId": "BUS_ID_HERE",
  "hotelId": "HOTEL_ID_HERE",
  "price": 22000,
  "discount": 10
}
```

## 📊 Analytics

### 1. Available Bus Seats

```http
GET http://localhost:5000/api/analytics/buses/BUS_ID_HERE/available-seats?date=2025-12-01
Authorization: Bearer YOUR_TOKEN_HERE
```

### 2. Available Hotel Rooms

```http
GET http://localhost:5000/api/analytics/hotels/HOTEL_ID_HERE/available-rooms?date=2025-12-01
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Trips Count Between Dates

```http
GET http://localhost:5000/api/analytics/trips/count?startDate=2025-11-01&endDate=2025-12-31
Authorization: Bearer YOUR_TOKEN_HERE
```

### 4. Active Pool Groups

```http
GET http://localhost:5000/api/analytics/pool-groups/active
Authorization: Bearer YOUR_TOKEN_HERE
```

### 5. Destination-wise Groups

```http
GET http://localhost:5000/api/analytics/destinations/groups
Authorization: Bearer YOUR_TOKEN_HERE
```

### 6. Upcoming Trips Summary

```http
GET http://localhost:5000/api/analytics/trips/upcoming-summary
Authorization: Bearer YOUR_TOKEN_HERE
```

### 7. Registration Count (Admin)

```http
GET http://localhost:5000/api/analytics/users/registrations?days=30
Authorization: Bearer ADMIN_TOKEN_HERE
```

## 🔐 Admin

### 1. Dashboard Statistics

```http
GET http://localhost:5000/api/admin/dashboard/stats
Authorization: Bearer ADMIN_TOKEN_HERE
```

### 2. Get All Users

```http
GET http://localhost:5000/api/admin/users?role=USER
Authorization: Bearer ADMIN_TOKEN_HERE
```

### 3. Get All Bookings

```http
GET http://localhost:5000/api/admin/bookings?status=CONFIRMED
Authorization: Bearer ADMIN_TOKEN_HERE
```

### 4. Get All Pool Groups

```http
GET http://localhost:5000/api/admin/pool-groups
Authorization: Bearer ADMIN_TOKEN_HERE
```

### 5. Get Pending Requests

```http
GET http://localhost:5000/api/admin/group-requests/pending
Authorization: Bearer ADMIN_TOKEN_HERE
```

### 6. Approve Group Request

```http
PATCH http://localhost:5000/api/admin/group-requests/REQUEST_ID_HERE/approve
Authorization: Bearer ADMIN_TOKEN_HERE
```

### 7. Update User Role

```http
PATCH http://localhost:5000/api/admin/users/USER_ID_HERE/role
Authorization: Bearer ADMIN_TOKEN_HERE
Content-Type: application/json

{
  "role": "ADMIN"
}
```

## 🧪 Testing Workflow

### Complete User Journey

1. **Register/Login**

   ```
   POST /api/auth/register
   POST /api/auth/login (save token)
   ```

2. **Create Trip**

   ```
   POST /api/trips
   ```

3. **Browse Buses & Hotels**

   ```
   GET /api/buses
   GET /api/hotels
   ```

4. **Create Pool Group**

   ```
   POST /api/pooling
   ```

5. **Another User Joins**

   ```
   POST /api/pooling/:id/join
   ```

6. **Approve Member**

   ```
   PATCH /api/pooling/:groupId/members/:memberId
   ```

7. **Make Booking**

   ```
   GET /api/buses/:id/seats/available
   GET /api/hotels/:id/rooms/available
   POST /api/bookings
   ```

8. **View Analytics**
   ```
   GET /api/analytics/trips/upcoming-summary
   GET /api/analytics/destinations/groups
   ```

## 💡 Tips

- Always include `Authorization: Bearer TOKEN` header for protected routes
- Use Postman or Thunder Client VS Code extension for testing
- Check response status codes (200 = success, 400 = bad request, 401 = unauthorized, etc.)
- Save commonly used IDs (tripId, busId, etc.) for easier testing
- Use Prisma Studio (`npm run prisma:studio`) to view database in real-time

## 📝 Response Format

### Success Response

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data here
  }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Error message",
  "errors": {
    // Validation errors if any
  }
}
```

### Paginated Response

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": {
    // Array of items
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

---

**Happy Testing! 🚀**

