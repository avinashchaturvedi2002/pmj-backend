const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_ROOM_COUNT = 20;
const ROOM_TYPES = ['Standard', 'Deluxe', 'Suite'];

function buildRoomPayload(hotelId, roomCount) {
  const payload = [];
  const count = Math.max(DEFAULT_ROOM_COUNT, roomCount || 0);

  for (let i = 0; i < count; i++) {
    const index = i + 1;
    let roomType = ROOM_TYPES[0];

    if (index <= Math.ceil(count * 0.1)) {
      roomType = 'Suite';
    } else if (index <= Math.ceil(count * 0.4)) {
      roomType = 'Deluxe';
    }

    payload.push({
      hotelId,
      roomNumber: `${String(index).padStart(3, '0')}`,
      roomType,
      isBooked: false
    });
  }

  return payload;
}

async function backfillHotelRooms() {
  console.log('🔍 Identifying hotels without rooms...');
  const hotelsNeedingRooms = await prisma.hotel.findMany({
    where: { rooms: { none: {} } },
    select: { id: true, totalRooms: true, name: true, location: true }
  });

  if (!hotelsNeedingRooms.length) {
    console.log('✅ All hotels already have rooms. No action needed.');
    return;
  }

  console.log(`🏨 Found ${hotelsNeedingRooms.length} hotels without rooms. Creating rooms...`);

  for (const hotel of hotelsNeedingRooms) {
    const roomPayload = buildRoomPayload(hotel.id, hotel.totalRooms);

    await prisma.hotelRoom.createMany({
      data: roomPayload
    });

    console.log(
      `  • Created ${roomPayload.length} rooms for "${hotel.name}" (${hotel.location})`
    );
  }

  console.log('✅ Backfill complete.');
}

backfillHotelRooms()
  .catch((error) => {
    console.error('❌ Error while backfilling hotel rooms:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

