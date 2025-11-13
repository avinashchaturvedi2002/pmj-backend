const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_CAPACITY = 40;
const DEFAULT_SEATS_PER_ROW = 4;
const SEAT_PREFIX = 'S';

const getSeatTypeForColumn = (columnIndex, seatsPerRow) => {
  if (seatsPerRow <= 2) {
    return columnIndex === 0 ? 'WINDOW' : 'AISLE';
  }

  if (columnIndex === 0 || columnIndex === seatsPerRow - 1) {
    return 'WINDOW';
  }

  return 'AISLE';
};

const buildSeatPayload = (bus) => {
  const capacity =
    Number.isInteger(bus.capacity) && bus.capacity > 0 ? bus.capacity : DEFAULT_CAPACITY;
  const seatsPerRow = DEFAULT_SEATS_PER_ROW;
  const padLength = capacity >= 100 ? 3 : 2;
  const payload = [];

  for (let i = 0; i < capacity; i++) {
    const seatNumber = `${SEAT_PREFIX}${String(i + 1).padStart(padLength, '0')}`;
    const rowIndex = Math.floor(i / seatsPerRow);
    const columnIndex = i % seatsPerRow;

    payload.push({
      busId: bus.id,
      seatNumber,
      isBooked: false,
      rowIndex,
      columnIndex,
      seatType: getSeatTypeForColumn(columnIndex, seatsPerRow)
    });
  }

  return payload;
};

async function backfillBusSeats() {
  console.log('🔎 Identifying buses without seats...');

  const busesNeedingSeats = await prisma.bus.findMany({
    where: { seats: { none: {} } },
    select: { id: true, busName: true, busNumber: true, capacity: true }
  });

  if (busesNeedingSeats.length === 0) {
    console.log('✅ All buses already have seats. No action needed.');
    return;
  }

  console.log(`🚌 Found ${busesNeedingSeats.length} buses without seats. Creating seats...`);

  for (const bus of busesNeedingSeats) {
    const seatPayload = buildSeatPayload(bus);

    await prisma.busSeat.createMany({
      data: seatPayload,
      skipDuplicates: true
    });

    console.log(
      `  • Created ${seatPayload.length} seats for "${bus.busName}" (${bus.busNumber || bus.id})`
    );
  }

  console.log('✅ Bus seat backfill complete.');
}

backfillBusSeats()
  .catch((error) => {
    console.error('❌ Error while backfilling bus seats:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


