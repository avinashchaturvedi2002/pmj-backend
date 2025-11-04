// prisma/seed.js
//
// Bulk seeder for PlanMyJourney (Prisma + MySQL)
// Generates:
//  - configurable number of unique locations (default: 10,000+)
//  - hotels spread across locations (bulk createMany, default ~15k)
//  - rooms per hotel (createMany, avg ~10 rooms -> ~150k rooms by default)
//  - buses between locations (createMany, default ~20k)
//  - seats per bus (createMany, capacity 30-60 -> many seats)
//
// Requirements:
//  npm i @prisma/client @faker-js/faker bcryptjs
//
// Run: node prisma/seed.js
//

const { PrismaClient } = require('@prisma/client');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ---------- CONFIGURATION (tweak these) ----------
const CONFIG = {
  LOCATIONS: 10000,            // number of unique location strings to create
  AVG_HOTELS_PER_LOCATION: 1.5, // average hotels per location -> totalHotels ~ LOCATIONS * AVG_HOTELS_PER_LOCATION
  MIN_ROOMS_PER_HOTEL: 6,
  MAX_ROOMS_PER_HOTEL: 14,
  TOTAL_BUSES: 20000,          // number of buses to create
  MIN_BUS_CAPACITY: 30,
  MAX_BUS_CAPACITY: 60,
  SEAT_NUMBERING_STYLE: 'S',   // prefix for seat numbers
  BATCH_SIZE: 1000,            // prisma createMany chunk size
  ADMIN_EMAIL: 'admin@planmyjourney.in',
  ADMIN_PASS: 'Password@123'
};
// -------------------------------------------------

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Small list of Indian major cities to base location names on:
const BASE_CITIES = [
  'Mumbai','Delhi','Bangalore','Hyderabad','Ahmedabad','Chennai','Kolkata','Surat','Pune','Jaipur',
  'Lucknow','Kanpur','Nagpur','Indore','Thane','Bhopal','Visakhapatnam','Pimpri-Chinchwad','Patna','Vadodara',
  'Ghaziabad','Ludhiana','Agra','Nashik','Faridabad','Meerut','Rajkot','Kalyan','Vasai','Varanasi',
  'Srinagar','Dhanbad','Jabalpur','Coimbatore','Vijayawada','Jodhpur','Madurai','Raipur','Kota','Guwahati',
  'Chandigarh','Solapur','Hubli','Amritsar','Mysore','Tiruchirappalli','Bareilly','Aligarh','Noida','Jalandhar'
];

// Utility to build a realistic-ish location string: "City - AreaName"
function buildLocation(index) {
  const city = faker.helpers.arrayElement(BASE_CITIES);
  const area = faker.location.city() // uses faker city-like token -> gives diversity
    .replace(/[,']/g, '')
    .split(' ')[0];
  return `${city} - ${area} ${index % 1000}`; // adding index chunk helps push uniqueness to 10k+
}

async function main() {
  console.log('🌱 Starting large-scale database seeding...');

  // 1) Clear existing data (careful in prod)
  console.log('🧹 Clearing existing tables (this may be slow for large datasets)...');
  // We delete in order that respects FK constraints
  await prisma.payment.deleteMany().catch(() => {});
  await prisma.busBooking.deleteMany().catch(() => {});
  await prisma.hotelBooking.deleteMany().catch(() => {});
  await prisma.booking.deleteMany().catch(() => {});
  await prisma.groupMember.deleteMany().catch(() => {});
  await prisma.package.deleteMany().catch(() => {});
  await prisma.poolGroup.deleteMany().catch(() => {});
  await prisma.trip.deleteMany().catch(() => {});
  await prisma.busSeat.deleteMany().catch(() => {});
  await prisma.bus.deleteMany().catch(() => {});
  await prisma.hotelRoom.deleteMany().catch(() => {});
  await prisma.hotel.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});

  // 2) Create admin + a few users
  console.log('👥 Creating admin and sample users...');
  const hashedPassword = await bcrypt.hash(CONFIG.ADMIN_PASS, 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: CONFIG.ADMIN_EMAIL,
      password: hashedPassword,
      role: 'ADMIN'
    }
  });

  const sampleUsers = [];
  for (let i = 1; i <= 10; i++) {
    sampleUsers.push({
      name: faker.person.fullName(),
      email: `testuser${i}@example.com`,
      password: hashedPassword,
      role: 'USER'
    });
  }
  // createMany does not return rows so use create for small set
  const userPromises = sampleUsers.map(u => prisma.user.create({ data: u }));
  const users = await Promise.all(userPromises);
  console.log(`✅ Created admin + ${users.length} test users`);

  // 3) Generate location strings
  console.log(`📍 Generating ${CONFIG.LOCATIONS} unique location strings...`);
  const locations = [];
  const seen = new Set();
  for (let i = 0; i < CONFIG.LOCATIONS; i++) {
    let loc;
    // ensure uniqueness
    do {
      loc = buildLocation(i);
    } while (seen.has(loc));
    seen.add(loc);
    locations.push(loc);
  }
  console.log(`✅ Generated ${locations.length} locations`);

  // 4) Create hotels in bulk across locations
  const estimatedHotels = Math.floor(CONFIG.LOCATIONS * CONFIG.AVG_HOTELS_PER_LOCATION);
  const hotelsToCreate = [];
  console.log(`🏨 Preparing ~${estimatedHotels} hotels (avg ${CONFIG.AVG_HOTELS_PER_LOCATION} per location)...`);
  for (let i = 0; i < estimatedHotels; i++) {
    const loc = faker.helpers.arrayElement(locations);
    const hotelName = `${faker.company.name()} ${faker.helpers.arrayElement(['Hotel','Resort','Inn','Suites','Lodge','Heritage'])}`;
    const price = Math.round(
      Math.max(500, Math.pow(Math.random(), 2) * 15000) // skewed distribution for price variety
    );
    hotelsToCreate.push({
      name: hotelName,
      location: loc,
      address: `${faker.location.streetAddress()}, ${loc.split(' - ')[0]}`,
      totalRooms: randomInt(6, 20),
      pricePerRoom: price,
      rating: Number((3 + Math.random() * 2).toFixed(1)),
      amenities: JSON.stringify(faker.helpers.uniqueArray(
        ['WiFi', 'Pool', 'Gym', 'Restaurant', 'Parking', 'AC', 'Breakfast', 'Spa', 'Houseboat Access', 'Banquet'],
        randomInt(2, 6)
      ))
    });
  }

  console.log('✈️ Inserting hotels in batches...');
  const hotelChunks = chunkArray(hotelsToCreate, CONFIG.BATCH_SIZE);
  for (let i = 0; i < hotelChunks.length; i++) {
    console.log(`  - inserting hotels batch ${i + 1}/${hotelChunks.length} (size ${hotelChunks[i].length})`);
    await prisma.hotel.createMany({ data: hotelChunks[i] });
  }
  console.log('✅ Hotels inserted');

  // 5) Read back hotels (we need ids to create rooms)
  console.log('🔎 Fetching created hotels (ids) ...');
  const allHotels = await prisma.hotel.findMany({ select: { id: true, totalRooms: true } });
  console.log(`✅ Retrieved ${allHotels.length} hotels from DB`);

  // 6) Create hotel rooms in bulk (avg ~10 rooms each based on totalRooms field)
  console.log('🛏️ Creating hotel rooms in batches (this may take a while)...');
  const hotelRoomInsertRows = [];
  for (const h of allHotels) {
    const roomCount = randomInt(CONFIG.MIN_ROOMS_PER_HOTEL, CONFIG.MAX_ROOMS_PER_HOTEL);
    for (let r = 1; r <= roomCount; r++) {
      let roomType = 'Standard';
      const pct = r / roomCount;
      if (pct <= 0.2) roomType = 'Suite';
      else if (pct <= 0.5) roomType = 'Deluxe';

      hotelRoomInsertRows.push({
        hotelId: h.id,
        roomNumber: `${String(r).padStart(3, '0')}`,
        roomType,
        isBooked: false
      });
    }
    // flush periodically to avoid huge memory
    if (hotelRoomInsertRows.length >= CONFIG.BATCH_SIZE) {
      const chunked = chunkArray(hotelRoomInsertRows, CONFIG.BATCH_SIZE);
      for (const c of chunked) {
        await prisma.hotelRoom.createMany({ data: c });
      }
      hotelRoomInsertRows.length = 0;
    }
  }
  // insert remaining
  if (hotelRoomInsertRows.length) {
    const chunked = chunkArray(hotelRoomInsertRows, CONFIG.BATCH_SIZE);
    for (const c of chunked) {
      await prisma.hotelRoom.createMany({ data: c });
    }
  }
  console.log('✅ Hotel rooms created');

  // 7) Create buses (between random location pairs)
  console.log(`🚌 Preparing ${CONFIG.TOTAL_BUSES} buses across ${locations.length} locations...`);
  const busesToCreate = [];
  for (let i = 0; i < CONFIG.TOTAL_BUSES; i++) {
    const src = faker.helpers.arrayElement(locations);
    let dest;
    do { dest = faker.helpers.arrayElement(locations); } while (dest === src);

    const capacity = randomInt(CONFIG.MIN_BUS_CAPACITY, CONFIG.MAX_BUS_CAPACITY);
    const pricePerSeat = Math.round(Math.max(200, Math.random() * 3000));
    busesToCreate.push({
      busNumber: `${src.split(' - ')[0].slice(0,2).toUpperCase()}${randomInt(10,99)}${faker.string.alphanumeric(4).toUpperCase()}`,
      busName: `${faker.company.name()} ${faker.helpers.arrayElement(['Volvo','Mercedes','Scania','Tata','Ashok Leyland'])}`,
      capacity,
      pricePerSeat,
      amenities: JSON.stringify(faker.helpers.uniqueArray(['AC','WiFi','Charging','Blanket','Pillow','TV'], randomInt(1,4)))
    });
  }

  console.log('✈️ Inserting buses in batches...');
  const busChunks = chunkArray(busesToCreate, CONFIG.BATCH_SIZE);
  for (let i = 0; i < busChunks.length; i++) {
    console.log(`  - inserting buses batch ${i + 1}/${busChunks.length} (size ${busChunks[i].length})`);
    await prisma.bus.createMany({ data: busChunks[i] });
  }
  console.log('✅ Buses inserted');

  // 8) Read buses back to create seats
  console.log('🔎 Fetching created buses (ids) ...');
  const allBuses = await prisma.bus.findMany({ select: { id: true, capacity: true } });
  console.log(`✅ Retrieved ${allBuses.length} buses from DB`);

  // 9) Create seats for each bus in batches
  console.log('💺 Creating bus seats in batches (this may take a while)...');
  const busSeatRows = [];
  for (const b of allBuses) {
    for (let s = 1; s <= b.capacity; s++) {
      busSeatRows.push({
        busId: b.id,
        seatNumber: `${CONFIG.SEAT_NUMBERING_STYLE}${s}`,
        isBooked: false
      });
      if (busSeatRows.length >= CONFIG.BATCH_SIZE) {
        const chunked = chunkArray(busSeatRows, CONFIG.BATCH_SIZE);
        for (const c of chunked) {
          await prisma.busSeat.createMany({ data: c });
        }
        busSeatRows.length = 0;
      }
    }
  }
  // flush remaining
  if (busSeatRows.length) {
    const chunked = chunkArray(busSeatRows, CONFIG.BATCH_SIZE);
    for (const c of chunked) {
      await prisma.busSeat.createMany({ data: c });
    }
  }
  console.log('✅ Bus seats created');

  // 10) Create a handful of Trips, PoolGroups, Packages, and one sample booking
  console.log('🧭 Creating sample trips/pool-groups/packages/bookings...');
  const trips = [];
  for (let i = 0; i < 6; i++) {
    const source = faker.helpers.arrayElement(locations);
    let dest;
    do { dest = faker.helpers.arrayElement(locations); } while (dest === source);
    trips.push(await prisma.trip.create({
      data: {
        source: source.split(' - ')[0],
        destination: dest.split(' - ')[0],
        startDate: faker.date.soon({ days: randomInt(10, 90) }),
        endDate: faker.date.soon({ days: randomInt(91, 120) }),
        budget: randomInt(5000, 50000),
        activityBudgetPercent: randomInt(20, 50),
        travelers: randomInt(1, 4),
        status: 'PLANNED',
        createdById: users[randomInt(0, users.length - 1)].id
      }
    }));
  }

  // Pool groups and packages
  const poolGroup = await prisma.poolGroup.create({
    data: {
      tripId: trips[0].id,
      groupSize: 4,
      currentSize: 1,
      status: 'OPEN',
      description: 'Prototype pool group',
      createdById: users[0].id
    }
  });

  // pick random bus and hotel for a package
  const someBus = allBuses.length > 0 ? await prisma.bus.findFirst() : null;
  const someHotel = allHotels.length > 0 ? await prisma.hotel.findFirst() : null;
  let samplePackage = null;
  if (someBus && someHotel) {
    samplePackage = await prisma.package.create({
      data: {
        name: 'Sample Package - Prototype',
        description: 'Auto generated sample package with one bus and one hotel',
        tripId: trips[0].id,
        busId: someBus.id,
        hotelId: someHotel.id,
        price: randomInt(8000, 50000),
        discount: randomInt(0, 20),
        isActive: true
      }
    });
  }

  // Create one confirmed booking with proper BusBooking and HotelBooking
  if (trips.length > 0 && allBuses.length > 0 && allHotels.length > 0) {
    const sampleTrip = trips[0];
    const sampleBus = await prisma.bus.findFirst();
    const sampleHotel = await prisma.hotel.findFirst();
    
    // Calculate pricing
    const travelers = 2;
    const busPricePerSeat = sampleBus.pricePerSeat;
    const hotelPricePerRoom = sampleHotel.pricePerRoom;
    const nights = 3;
    const roomsNeeded = Math.ceil(travelers / 2);
    
    const busOutboundCost = busPricePerSeat * travelers;
    const busReturnCost = busPricePerSeat * travelers;
    const hotelCost = hotelPricePerRoom * nights * roomsNeeded;
    const totalPrice = busOutboundCost + busReturnCost + hotelCost;
    
    const booking = await prisma.booking.create({
      data: {
        userId: users[0].id,
        tripId: sampleTrip.id,
        packageId: samplePackage ? samplePackage.id : null,
        totalPrice: totalPrice,
        status: 'CONFIRMED'
      }
    });
    
    // Create payment record for this booking
    await prisma.payment.create({
      data: {
        userId: users[0].id,
        bookingId: booking.id,
        tripId: sampleTrip.id,
        packageId: samplePackage ? samplePackage.id : null,
        busId: sampleBus.id,
        hotelId: sampleHotel.id,
        amount: totalPrice * 100, // Convert to paise
        currency: 'INR',
        razorpayOrderId: `order_${faker.string.alphanumeric(14)}`,
        razorpayPaymentId: `pay_${faker.string.alphanumeric(14)}`,
        status: 'SUCCESS',
        paymentMethod: faker.helpers.arrayElement(['card', 'upi', 'netbanking'])
      }
    });
    
    // Create outbound bus booking
    await prisma.busBooking.create({
      data: {
        bookingId: booking.id,
        busId: sampleBus.id,
        bookingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        seatsBooked: travelers,
        seatNumbers: null,
        pricePerSeat: busPricePerSeat,
        totalPrice: busOutboundCost
      }
    });
    
    // Create return bus booking
    await prisma.busBooking.create({
      data: {
        bookingId: booking.id,
        busId: sampleBus.id,
        bookingDate: new Date(Date.now() + (7 + nights) * 24 * 60 * 60 * 1000),
        seatsBooked: travelers,
        seatNumbers: null,
        pricePerSeat: busPricePerSeat,
        totalPrice: busReturnCost
      }
    });
    
    // Create hotel booking
    await prisma.hotelBooking.create({
      data: {
        bookingId: booking.id,
        hotelId: sampleHotel.id,
        checkIn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        checkOut: new Date(Date.now() + (7 + nights) * 24 * 60 * 60 * 1000),
        roomsBooked: roomsNeeded,
        roomNumbers: null,
        pricePerRoom: hotelPricePerRoom,
        totalPrice: hotelCost
      }
    });
    
    console.log('✅ Created one sample confirmed booking with bus & hotel bookings.');
    console.log(`   Total: ₹${totalPrice} (Bus: ₹${busOutboundCost + busReturnCost}, Hotel: ₹${hotelCost})`);
  } else {
    console.log('⚠️ Skipped booking creation - missing trips, buses, or hotels.');
  }

  // Final summary
  const finalCounts = {
    users: await prisma.user.count(),
    hotels: await prisma.hotel.count(),
    hotelRooms: await prisma.hotelRoom.count(),
    buses: await prisma.bus.count(),
    busSeats: await prisma.busSeat.count(),
    trips: await prisma.trip.count(),
    packages: await prisma.package.count(),
    bookings: await prisma.booking.count(),
    payments: await prisma.payment.count(),
    busBookings: await prisma.busBooking.count(),
    hotelBookings: await prisma.hotelBooking.count()
  };

  console.log('\n✨ Large seeding completed!');
  console.log('📊 Final counts:');
  console.log(`  - Users: ${finalCounts.users}`);
  console.log(`  - Hotels: ${finalCounts.hotels}`);
  console.log(`  - Hotel Rooms: ${finalCounts.hotelRooms}`);
  console.log(`  - Buses: ${finalCounts.buses}`);
  console.log(`  - Bus Seats: ${finalCounts.busSeats}`);
  console.log(`  - Trips: ${finalCounts.trips}`);
  console.log(`  - Packages: ${finalCounts.packages}`);
  console.log(`  - Bookings: ${finalCounts.bookings}`);
  console.log(`  - Payments: ${finalCounts.payments}`);
  console.log(`  - Bus Bookings: ${finalCounts.busBookings}`);
  console.log(`  - Hotel Bookings: ${finalCounts.hotelBookings}`);
  console.log('\n🔑 Admin Credentials:');
  console.log(`   Email: ${CONFIG.ADMIN_EMAIL}`);
  console.log(`   Password: ${CONFIG.ADMIN_PASS}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
