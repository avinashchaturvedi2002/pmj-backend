const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting demo data seeding...');

  // Demo users with known passwords for testing
  const demoUsers = [
    {
      email: 'demo@planmyjourney.in',
      password: 'Demo@123',
      name: 'Demo User',
      role: 'USER'
    },
    {
      email: 'alice@test.com',
      password: 'Alice@123',
      name: 'Alice Johnson',
      role: 'USER'
    },
    {
      email: 'bob@test.com',
      password: 'Bob@123',
      name: 'Bob Smith',
      role: 'USER'
    },
    {
      email: 'charlie@test.com',
      password: 'Charlie@123',
      name: 'Charlie Brown',
      role: 'USER'
    }
  ];

  console.log('👥 Creating demo users...');
  const createdUsers = [];
  
  for (const userData of demoUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email }
    });

    if (existingUser) {
      console.log(`   ✓ User ${userData.email} already exists, skipping...`);
      createdUsers.push(existingUser);
    } else {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = await prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword
        }
      });
      createdUsers.push(user);
      console.log(`   ✓ Created user: ${user.email}`);
    }
  }

  const [demoUser, alice, bob, charlie] = createdUsers;

  // Demo Buses for popular routes (Bhopal → Goa route)
  console.log('\n🚌 Creating demo buses...');
  const demoBuses = [
    {
      busName: 'Demo Express',
      busNumber: 'DEMO-BUS-001',
      capacity: 40,
      pricePerSeat: 2,
      amenities: JSON.stringify(['AC', 'WiFi'])
    },
    {
      busName: 'Shivneri Express',
      busNumber: 'MP-12-AB-1234',
      capacity: 40,
      pricePerSeat: 1500,
      amenities: JSON.stringify(['AC', 'Sleeper', 'WiFi', 'Charging Port', 'Blankets'])
    },
    {
      busName: 'Neeta Volvo',
      busNumber: 'MP-12-CD-5678',
      capacity: 45,
      pricePerSeat: 1200,
      amenities: JSON.stringify(['AC', 'Seater', 'WiFi', 'Entertainment', 'USB Charging'])
    },
    {
      busName: 'Royal Travels',
      busNumber: 'MP-02-EF-9012',
      capacity: 35,
      pricePerSeat: 1800,
      amenities: JSON.stringify(['AC', 'Sleeper', 'WiFi', 'Blankets', 'Reading Light', 'Pillow'])
    },
    {
      busName: 'VRL Travels',
      busNumber: 'MP-01-GH-3456',
      capacity: 40,
      pricePerSeat: 1400,
      amenities: JSON.stringify(['AC', 'Sleeper', 'WiFi', 'Water Bottle'])
    },
    {
      busName: 'Orange Travels',
      busNumber: 'MP-01-IJ-7890',
      capacity: 50,
      pricePerSeat: 1000,
      amenities: JSON.stringify(['AC', 'Seater', 'Music System', 'WiFi'])
    }
  ];

  const createdBuses = [];
  for (const busData of demoBuses) {
    // Check if bus already exists
    const existingBus = await prisma.bus.findUnique({
      where: { busNumber: busData.busNumber }
    });

    if (existingBus) {
      console.log(`   ✓ Bus ${busData.busNumber} already exists, skipping...`);
      createdBuses.push(existingBus);
    } else {
      const bus = await prisma.bus.create({ data: busData });
      createdBuses.push(bus);
      console.log(`   ✓ Created bus: ${bus.busName} (${bus.busNumber}) - Capacity: ${bus.capacity} seats`);
    }
  }

  // Demo Hotels in popular destinations
  console.log('\n🏨 Creating demo hotels...');
  const demoHotels = [
    {
      name: 'Demo Inn Goa',
      location: 'Goa',
      address: 'Demo Location, Goa',
      rating: 4.5,
      amenities: JSON.stringify(['WiFi', 'Breakfast']),
      pricePerRoom: 0.5,
      totalRooms: 20
    },
    {
      name: 'Taj Resort & Spa',
      location: 'Goa',
      address: 'Calangute Beach Road, North Goa',
      rating: 4.8,
      amenities: JSON.stringify(['WiFi', 'Pool', 'Spa', 'Restaurant', 'Beach Access', 'Gym']),
      pricePerRoom: 5000,
      totalRooms: 50
    },
    {
      name: 'Beach Paradise Hotel',
      location: 'Goa',
      address: 'Baga Beach, North Goa',
      rating: 4.5,
      amenities: JSON.stringify(['WiFi', 'Pool', 'Restaurant', 'Beach View', 'Bar']),
      pricePerRoom: 3500,
      totalRooms: 40
    },
    {
      name: 'Goa Sunset Resort',
      location: 'Goa',
      address: 'Candolim Beach, North Goa',
      rating: 4.2,
      amenities: JSON.stringify(['WiFi', 'Pool', 'Restaurant', 'Free Breakfast']),
      pricePerRoom: 2500,
      totalRooms: 30
    },
    {
      name: 'Coastal Inn',
      location: 'Goa',
      address: 'Panjim City Center, Goa',
      rating: 4.0,
      amenities: JSON.stringify(['WiFi', 'Restaurant', 'AC', 'Free Parking']),
      pricePerRoom: 1800,
      totalRooms: 25
    },
    {
      name: 'The Gateway Hotel',
      location: 'Bangalore',
      address: 'MG Road, Bangalore',
      rating: 4.6,
      amenities: JSON.stringify(['WiFi', 'Pool', 'Gym', 'Restaurant', 'Conference Rooms']),
      pricePerRoom: 4000,
      totalRooms: 60
    },
    {
      name: 'Pondicherry Beach Resort',
      location: 'Pondicherry',
      address: 'Promenade Beach Road, Pondicherry',
      rating: 4.4,
      amenities: JSON.stringify(['WiFi', 'Beach Access', 'Restaurant', 'Yoga Center']),
      pricePerRoom: 2800,
      totalRooms: 35
    }
  ];

  const createdHotels = [];
  for (const hotelData of demoHotels) {
    // Check if hotel already exists (by name and location)
    const existingHotel = await prisma.hotel.findFirst({
      where: { 
        name: hotelData.name,
        location: hotelData.location
      }
    });

    if (existingHotel) {
      console.log(`   ✓ Hotel "${hotelData.name}" in ${hotelData.location} already exists, skipping...`);
      createdHotels.push(existingHotel);
    } else {
      const hotel = await prisma.hotel.create({ data: hotelData });
      createdHotels.push(hotel);
      console.log(`   ✓ Created hotel: ${hotel.name} in ${hotel.location}`);
    }
  }

  // Create demo trips for different scenarios (Bhopal → Goa)
  console.log('\n✈️ Creating demo trips...');
  
  // Trip 1: Individual trip for demo user (Bhopal → Goa, Oct 11-15, 2025)
  const trip1 = await prisma.trip.create({
    data: {
      createdById: demoUser.id,
      source: 'Bhopal',
      destination: 'Goa',
      startDate: new Date('2025-10-11'),
      endDate: new Date('2025-10-15'),
      budget: 35000,
      travelers: 2,
      status: 'PLANNED'
    }
  });
  console.log(`   ✓ Created trip: ${trip1.source} → ${trip1.destination} for ${demoUser.name}`);

  // Trip 2: Group trip for Alice (Bhopal → Goa, Oct 11-15, 2025)
  const trip2 = await prisma.trip.create({
    data: {
      createdById: alice.id,
      source: 'Bhopal',
      destination: 'Goa',
      startDate: new Date('2025-10-11'),
      endDate: new Date('2025-10-15'),
      budget: 30000,
      travelers: 4,
      status: 'PLANNED'
    }
  });
  console.log(`   ✓ Created trip: ${trip2.source} → ${trip2.destination} for ${alice.name}`);

  // Trip 3: Another trip for Bob (Bhopal → Goa, Oct 11-15, 2025)
  const trip3 = await prisma.trip.create({
    data: {
      createdById: bob.id,
      source: 'Bhopal',
      destination: 'Goa',
      startDate: new Date('2025-10-11'),
      endDate: new Date('2025-10-15'),
      budget: 28000,
      travelers: 2,
      status: 'PLANNED'
    }
  });
  console.log(`   ✓ Created trip: ${trip3.source} → ${trip3.destination} for ${bob.name}`);

  // Create demo pool group (for group travel testing - Bhopal → Goa)
  console.log('\n👥 Creating demo pool group...');
  const poolGroup = await prisma.poolGroup.create({
    data: {
      tripId: trip2.id,
      createdById: alice.id,
      groupSize: 4,
      currentSize: 3,
      status: 'OPEN',
      description: 'Planning a group trip from Bhopal to Goa (Oct 11-15)! Looking for travel buddies to share the adventure. Beach, parties, sightseeing, and good vibes! 🏖️🎉'
    }
  });
  console.log(`   ✓ Created pool group for trip: ${trip2.source} → ${trip2.destination}`);

  // Add members to pool group
  console.log('\n👤 Adding members to pool group...');
  
  // Alice is the creator and a member
  const member1 = await prisma.groupMember.create({
    data: {
      poolGroupId: poolGroup.id,
      userId: alice.id,
      status: 'APPROVED',
      paymentStatus: 'PENDING'
    }
  });
  console.log(`   ✓ Added ${alice.name} as creator/member`);

  // Bob joins the group
  const member2 = await prisma.groupMember.create({
    data: {
      poolGroupId: poolGroup.id,
      userId: bob.id,
      status: 'APPROVED',
      paymentStatus: 'PENDING'
    }
  });
  console.log(`   ✓ Added ${bob.name} as member`);

  // Charlie joins the group
  const member3 = await prisma.groupMember.create({
    data: {
      poolGroupId: poolGroup.id,
      userId: charlie.id,
      status: 'APPROVED',
      paymentStatus: 'PENDING'
    }
  });
  console.log(`   ✓ Added ${charlie.name} as member`);

  // Create demo packages (Bhopal → Goa, Oct 11-15, 2025: 4 nights)
  console.log('\n📦 Creating demo packages...');
  
  // Demo Package: Demo Express + Demo Inn (4 nights) - ₹4 total for testing
  const demoPackage = await prisma.package.create({
    data: {
      busId: createdBuses[0].id,
      hotelId: createdHotels[0].id,
      name: 'Demo Test Package (Bhopal → Goa)',
      description: 'Special demo package for testing payment flow. Includes round-trip bus from Bhopal and 4 nights hotel stay in Goa.',
      price: 4, // (2 bus + 0.5*4 hotel nights = 4)
      discount: 0,
      isActive: true
    }
  });
  console.log(`   ✓ Created package: ${demoPackage.name} - ₹${demoPackage.price} (DEMO PACKAGE FOR TESTING)`);

  // Package 1: Shivneri Express + Taj Resort (4 nights)
  const package1 = await prisma.package.create({
    data: {
      busId: createdBuses[1].id,
      hotelId: createdHotels[1].id,
      name: 'Premium Goa Package (Bhopal → Goa)',
      description: 'Luxury travel with AC Sleeper bus and 5-star resort stay. Includes round-trip AC Sleeper bus from Bhopal, 4 nights at Taj Resort, breakfast, WiFi, pool & spa access, and beach access.',
      price: 23000, // (1500*2 round-trip + 5000*4 nights)
      discount: 0,
      isActive: true
    }
  });
  console.log(`   ✓ Created package: ${package1.name} - ₹${package1.price} (₹${package1.price/4}/person for 4 members)`);

  // Package 2: Neeta Volvo + Beach Paradise (4 nights)
  const package2 = await prisma.package.create({
    data: {
      busId: createdBuses[2].id,
      hotelId: createdHotels[2].id,
      name: 'Comfort Goa Package (Bhopal → Goa)',
      description: 'Comfortable travel with AC bus and beachfront hotel. Includes round-trip AC bus from Bhopal, 4 nights at Beach Paradise, beach view rooms, WiFi, pool, and bar access.',
      price: 16400, // (1200*2 + 3500*4)
      discount: 0,
      isActive: true
    }
  });
  console.log(`   ✓ Created package: ${package2.name} - ₹${package2.price} (₹${package2.price/4}/person for 4 members)`);

  // Package 3: Royal Travels + Goa Sunset Resort (4 nights)
  const package3 = await prisma.package.create({
    data: {
      busId: createdBuses[3].id,
      hotelId: createdHotels[3].id,
      name: 'Value Goa Package (Bhopal → Goa)',
      description: 'Budget-friendly package with comfortable amenities. Includes round-trip AC Sleeper from Bhopal, 4 nights hotel stay, free breakfast, WiFi, pool, and restaurant.',
      price: 13600, // (1800*2 + 2500*4)
      discount: 0,
      isActive: true
    }
  });
  console.log(`   ✓ Created package: ${package3.name} - ₹${package3.price} (₹${package3.price/4}/person for 4 members)`);

  console.log('\n✅ Demo data seeding completed successfully!');
  console.log('\n' + '='.repeat(80));
  console.log('📋 DEMO DATA SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\n👥 DEMO USERS (Login Credentials):');
  console.log('─'.repeat(80));
  demoUsers.forEach(user => {
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${user.password}`);
    console.log(`   Name:     ${user.name}`);
    console.log('   ' + '─'.repeat(76));
  });

  console.log('\n🚌 BUSES AVAILABLE:');
  console.log('─'.repeat(80));
  demoBuses.forEach(bus => {
    console.log(`   ${bus.busName} (${bus.busNumber})`);
    console.log(`   Price: ₹${bus.pricePerSeat}/seat | Capacity: ${bus.capacity} seats`);
    console.log(`   Amenities: ${JSON.parse(bus.amenities).join(', ')}`);
    console.log('   ' + '─'.repeat(76));
  });

  console.log('\n🏨 HOTELS AVAILABLE:');
  console.log('─'.repeat(80));
  demoHotels.forEach(hotel => {
    console.log(`   ${hotel.name} (${hotel.location})`);
    console.log(`   Address: ${hotel.address}`);
    console.log(`   Rating: ${hotel.rating} ⭐ | Price: ₹${hotel.pricePerRoom}/room`);
    console.log(`   Total Rooms: ${hotel.totalRooms}`);
    console.log('   ' + '─'.repeat(76));
  });

  console.log('\n✈️ DEMO TRIPS CREATED:');
  console.log('─'.repeat(80));
  console.log(`   1. ${trip1.source} → ${trip1.destination}`);
  console.log(`      User: ${demoUser.name} | Budget: ₹${trip1.budget}`);
  console.log(`      Dates: ${trip1.startDate.toLocaleDateString()} - ${trip1.endDate.toLocaleDateString()}`);
  console.log('   ' + '─'.repeat(76));
  console.log(`   2. ${trip2.source} → ${trip2.destination} (Group Trip)`);
  console.log(`      User: ${alice.name} | Budget: ₹${trip2.budget}`);
  console.log(`      Dates: ${trip2.startDate.toLocaleDateString()} - ${trip2.endDate.toLocaleDateString()}`);
  console.log(`      Pool Group: ${poolGroup.currentSize}/${poolGroup.groupSize} members`);
  console.log('   ' + '─'.repeat(76));
  console.log(`   3. ${trip3.source} → ${trip3.destination}`);
  console.log(`      User: ${bob.name} | Budget: ₹${trip3.budget}`);
  console.log(`      Dates: ${trip3.startDate.toLocaleDateString()} - ${trip3.endDate.toLocaleDateString()}`);
  console.log('   ' + '─'.repeat(76));

  console.log('\n📦 PACKAGES AVAILABLE:');
  console.log('─'.repeat(80));
  [demoPackage, package1, package2, package3].forEach((pkg, idx) => {
    console.log(`   ${idx + 1}. ${pkg.name}`);
    console.log(`      Price: ₹${pkg.price} | Discount: ${pkg.discount}%`);
    console.log(`      ${pkg.description}`);
    console.log('   ' + '─'.repeat(76));
  });

  console.log('\n🎯 TEST SCENARIOS:');
  console.log('─'.repeat(80));
  console.log('   🔥 DEMO PAYMENT FLOW (₹4 Real Payment Test):');
  console.log('      • Login as: demo@planmyjourney.in / Demo@123');
  console.log('      • Plan a trip: Bhopal → Goa');
  console.log('      • Start Date: 11-10-2025 (Oct 11, 2025)');
  console.log('      • End Date: 15-10-2025 (Oct 15, 2025)');
  console.log('      • Budget: ₹10 (IMPORTANT!)');
  console.log('      • Travelers: 1');
  console.log('      • Activity Budget: 30% (default)');
  console.log('      • Will show ONLY 1 package: Demo Test Package (₹4)');
  console.log('      • Click "Book Package - ₹4"');
  console.log('      • Complete REAL Razorpay payment (₹4 will be charged)');
  console.log('      • Verify booking appears in "My Bookings"');
  console.log('      • Payment status should be COMPLETED');
  console.log('');
  console.log('   1. INDIVIDUAL BOOKING FLOW (Regular):');
  console.log('      • Login as: demo@planmyjourney.in / Demo@123');
  console.log('      • Plan a trip: Bhopal → Goa (Oct 11-15, 2025)');
  console.log('      • Budget: ₹35,000+ for regular packages');
  console.log('      • View suggested packages (3-4 options available)');
  console.log('');
  console.log('   2. GROUP POOLING FLOW:');
  console.log('      • Login as Alice: alice@test.com / Alice@123');
  console.log('      • Go to "Pooling" → See active group trip (Bhopal → Goa)');
  console.log('      • Click "Manage Group" to set package (4 available)');
  console.log('      • Login as Bob/Charlie to approve package');
  console.log('      • Each member makes payment');
  console.log('      • Alice locks group after all payments complete');
  console.log('');
  console.log('   3. BROWSE AND EXPLORE:');
  console.log('      • View all buses (6 available: 1 demo + 5 regular)');
  console.log('      • View all hotels (7 available: 1 demo + 6 regular)');
  console.log('      • Filter packages by price/rating');
  console.log('      • Check bookings page');
  console.log('─'.repeat(80));

  console.log('\n💳 RAZORPAY PAYMENT INFO:');
  console.log('─'.repeat(80));
  console.log('   🔴 LIVE MODE: Real payments will be charged!');
  console.log('   For Demo Test Package: ₹4 will be actually charged');
  console.log('   Use your real card for ₹4 payment demonstration');
  console.log('─'.repeat(80));

  console.log('\n🚀 READY TO TEST!');
  console.log('   Start backend: cd pmj-backend && npm run dev');
  console.log('   Start frontend: cd pmj-frontend && npm run dev');
  console.log('   Open browser: http://localhost:5173');
  console.log('='.repeat(80) + '\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

