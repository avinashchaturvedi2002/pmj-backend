import { randomUUID } from 'crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createInitialState = () => ({
  trips: [
    {
      id: 'trip-1',
      createdById: 'test-user',
      startDate: new Date('2025-12-01T00:00:00.000Z'),
      endDate: new Date('2025-12-05T00:00:00.000Z'),
      travelers: 2,
      budget: 50000,
      activityBudgetPercent: 30
    }
  ],
  buses: [
    {
      id: 'bus-1',
      busNumber: 'BUS123',
      busName: 'Test Coach',
      pricePerSeat: 1000,
      capacity: 4
    }
  ],
  busSeats: [
    { id: 'seat-1', busId: 'bus-1', seatNumber: 'S1', deck: null, rowIndex: 0, columnIndex: 0, seatType: 'STANDARD', createdAt: new Date(), updatedAt: new Date() },
    { id: 'seat-2', busId: 'bus-1', seatNumber: 'S2', deck: null, rowIndex: 0, columnIndex: 1, seatType: 'STANDARD', createdAt: new Date(), updatedAt: new Date() },
    { id: 'seat-3', busId: 'bus-1', seatNumber: 'S3', deck: null, rowIndex: 1, columnIndex: 0, seatType: 'STANDARD', createdAt: new Date(), updatedAt: new Date() },
    { id: 'seat-4', busId: 'bus-1', seatNumber: 'S4', deck: null, rowIndex: 1, columnIndex: 1, seatType: 'STANDARD', createdAt: new Date(), updatedAt: new Date() }
  ],
  busSeatReservations: [],
  hotels: [
    { id: 'hotel-1', name: 'Test Hotel', location: 'Test City', pricePerRoom: 5000 }
  ],
  hotelRooms: [
    { id: 'room-1', hotelId: 'hotel-1', roomNumber: '101', roomType: 'Standard', capacity: 2, floor: 1 },
    { id: 'room-2', hotelId: 'hotel-1', roomNumber: '102', roomType: 'Standard', capacity: 2, floor: 1 },
    { id: 'room-3', hotelId: 'hotel-1', roomNumber: '103', roomType: 'Standard', capacity: 2, floor: 1 },
    { id: 'room-4', hotelId: 'hotel-1', roomNumber: '104', roomType: 'Standard', capacity: 2, floor: 1 }
  ],
  hotelRoomAllocations: [],
  payments: [],
  bookings: []
});

let state = createInitialState();

const resetState = () => {
  state = createInitialState();
};

const getState = () => state;

const matchCondition = (record, condition) => {
  if (!condition) return true;
  if (Array.isArray(condition)) {
    return condition.every((sub) => matchCondition(record, sub));
  }

  return Object.entries(condition).every(([key, value]) => {
    if (key === 'AND' && Array.isArray(value)) {
      return value.every((sub) => matchCondition(record, sub));
    }

    const recordValue = record[key];

    if (value instanceof Date || recordValue instanceof Date) {
      const left = recordValue instanceof Date ? recordValue.getTime() : new Date(recordValue).getTime();
      const right = value instanceof Date ? value.getTime() : new Date(value).getTime();
      return left === right;
    }

    if (value && typeof value === 'object') {
      if ('in' in value) {
        return value.in.includes(recordValue);
      }
      if ('lt' in value || 'lte' in value || 'gt' in value || 'gte' in value) {
        const left = recordValue instanceof Date ? recordValue.getTime() : recordValue;
        const compare = (operand) =>
          operand instanceof Date ? operand.getTime() : operand;
        if ('lt' in value && !(left < compare(value.lt))) return false;
        if ('lte' in value && !(left <= compare(value.lte))) return false;
        if ('gt' in value && !(left > compare(value.gt))) return false;
        if ('gte' in value && !(left >= compare(value.gte))) return false;
        return true;
      }
    }

    return recordValue === value;
  });
};

const filterRecords = (records, where) => {
  return records.filter((record) => matchCondition(record, where));
};

vi.mock('@prisma/client', () => {
  class PrismaClient {
    constructor() {
      this.trip = {
        findUnique: async ({ where }) => state.trips.find((trip) => trip.id === where.id) || null
      };

      this.bus = {
        findUnique: async ({ where }) => state.buses.find((bus) => bus.id === where.id) || null
      };

      this.busSeat = {
        findMany: async ({ where }) => state.busSeats.filter((seat) => seat.busId === where.busId)
      };

      this.busSeatReservation = {
        findMany: async ({ where }) => filterRecords(state.busSeatReservations, where),
        findUnique: async ({ where }) => {
          if (where.busId_journeyDate_seatNumber) {
            const { busId, journeyDate, seatNumber } = where.busId_journeyDate_seatNumber;
            return state.busSeatReservations.find(
              (reservation) =>
                reservation.busId === busId &&
                reservation.seatNumber === seatNumber &&
                reservation.journeyDate.getTime() === new Date(journeyDate).getTime()
            ) || null;
          }
          if (where.id) {
            return state.busSeatReservations.find((reservation) => reservation.id === where.id) || null;
          }
          return null;
        },
        create: async ({ data }) => {
          const record = {
            id: randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data
          };
          state.busSeatReservations.push(record);
          return record;
        },
        update: async ({ where, data }) => {
          const record = await this.busSeatReservation.findUnique({ where });
          if (!record) {
            throw new Error('Reservation not found');
          }
          Object.assign(record, data, { updatedAt: new Date() });
          return record;
        },
        updateMany: async ({ where, data }) => {
          const matches = filterRecords(state.busSeatReservations, where);
          matches.forEach((record) => Object.assign(record, data, { updatedAt: new Date() }));
          return { count: matches.length };
        }
      };

      this.hotel = {
        findUnique: async ({ where }) => state.hotels.find((hotel) => hotel.id === where.id) || null
      };

      this.hotelRoom = {
        findMany: async ({ where }) => state.hotelRooms.filter((room) => room.hotelId === where.hotelId)
      };

      this.hotelRoomAllocation = {
        findMany: async ({ where }) => filterRecords(state.hotelRoomAllocations, where),
        findFirst: async ({ where }) => filterRecords(state.hotelRoomAllocations, where)[0] || null,
        create: async ({ data }) => {
          const record = {
            id: randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data
          };
          state.hotelRoomAllocations.push(record);
          return record;
        },
        update: async ({ where, data }) => {
          const record = state.hotelRoomAllocations.find((allocation) => allocation.id === where.id);
          if (!record) {
            throw new Error('Room allocation not found');
          }
          Object.assign(record, data, { updatedAt: new Date() });
          return record;
        },
        updateMany: async ({ where, data }) => {
          const matches = filterRecords(state.hotelRoomAllocations, where);
          matches.forEach((record) => Object.assign(record, data, { updatedAt: new Date() }));
          return { count: matches.length };
        }
      };

      this.booking = {
        create: async ({ data }) => {
          const record = {
            id: randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data
          };
          state.bookings.push(record);
          return record;
        }
      };

      this.busBooking = {
        create: async ({ data }) => ({
          id: randomUUID(),
          ...data
        })
      };

      this.hotelBooking = {
        create: async ({ data }) => ({
          id: randomUUID(),
          ...data
        })
      };

      this.payment = {
        findUnique: async ({ where }) => state.payments.find((payment) => payment.id === where.id) || null,
        update: async ({ where, data }) => {
          const payment = state.payments.find((record) => record.id === where.id);
          if (!payment) {
            throw new Error('Payment not found');
          }
          Object.assign(payment, data);
          return payment;
        }
      };
    }

    async $transaction(callback) {
      return callback(this);
    }
  }

  return {
    PrismaClient,
    __resetState: resetState,
    __getState: getState
  };
});

import app from '../src/app';
import { __resetState, __getState } from '@prisma/client';

process.env.NODE_ENV = 'test';

describe('Reservation flows', () => {
  beforeEach(() => {
    __resetState();
  });

  it('holds and confirms bus seats', async () => {
    const holdRes = await request(app)
      .post('/api/buses/bus-1/hold')
      .send({
        tripId: 'trip-1',
        journeyDate: '2025-12-01',
        seatNumbers: ['S1']
      })
      .expect(200);

    const holdToken = holdRes.body.data.holdToken;
    expect(holdRes.body.data.heldSeats).toContain('S1');

    const confirmRes = await request(app)
      .post('/api/buses/bus-1/confirm')
      .send({
        holdToken,
        tripId: 'trip-1',
        legs: [
          {
            journeyDate: '2025-12-01',
            seatNumbers: ['S1']
          }
        ]
      })
      .expect(200);

    expect(confirmRes.body.data.confirmedSeats).toHaveLength(1);

    const seatMap = await request(app)
      .get('/api/buses/bus-1/seats')
      .query({
        tripId: 'trip-1',
        journeyDate: '2025-12-01'
      })
      .expect(200);

    const seat = seatMap.body.data.seats.find((s) => s.seatNumber === 'S1');
    expect(seat.status).toBe('BOOKED');
  });

  it('expires stale seat holds automatically', async () => {
    const holdRes = await request(app)
      .post('/api/buses/bus-1/hold')
      .send({
        tripId: 'trip-1',
        journeyDate: '2025-12-01',
        seatNumbers: ['S2']
      })
      .expect(200);

    const store = __getState();
    const reservation = store.busSeatReservations.find((r) => r.seatNumber === 'S2');
    reservation.holdExpiresAt = new Date(Date.now() - 60_000);

    const seatMap = await request(app)
      .get('/api/buses/bus-1/seats')
      .query({
        tripId: 'trip-1',
        journeyDate: '2025-12-01',
        holdToken: holdRes.body.data.holdToken
      })
      .expect(200);

    const seat = seatMap.body.data.seats.find((s) => s.seatNumber === 'S2');
    expect(seat.status).toBe('AVAILABLE');
  });

  it('prevents double booking of a held seat', async () => {
    const store = __getState();
    store.busSeatReservations.push({
      id: 'existing-seat-hold',
      busId: 'bus-1',
      busSeatId: 'seat-1',
      tripId: 'trip-1',
      journeyDate: new Date('2025-12-01T00:00:00.000Z'),
      seatNumber: 'S3',
      status: 'HELD',
      holdToken: 'other-user-hold',
      holdExpiresAt: new Date(Date.now() + 60_000),
      bookingId: null,
      paymentId: null,
      userId: 'other-user',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const conflictRes = await request(app)
      .post('/api/buses/bus-1/hold')
      .send({
        tripId: 'trip-1',
        journeyDate: '2025-12-01',
        seatNumbers: ['S3']
      })
      .expect(409);

    expect(conflictRes.body.message).toContain('Unable to hold');
  });

  it('holds and confirms hotel rooms', async () => {
    const holdRes = await request(app)
      .post('/api/hotels/hotel-1/hold')
      .send({
        tripId: 'trip-1',
        checkIn: '2025-12-01',
        checkOut: '2025-12-05',
        roomsNeeded: 2
      })
      .expect(200);

    expect(holdRes.body.data.heldRooms).toHaveLength(2);
    const holdToken = holdRes.body.data.holdToken;
    const roomNumbers = holdRes.body.data.heldRooms;

    const confirmRes = await request(app)
      .post('/api/hotels/hotel-1/confirm')
      .send({
        holdToken,
        tripId: 'trip-1',
        roomNumbers,
        checkIn: '2025-12-01',
        checkOut: '2025-12-05'
      })
      .expect(200);

    expect(confirmRes.body.data.confirmedRooms).toHaveLength(roomNumbers.length);

    const store = __getState();
    const allocations = store.hotelRoomAllocations.filter((allocation) => roomNumbers.includes(allocation.roomNumber));
    allocations.forEach((allocation) => {
      expect(allocation.status).toBe('BOOKED');
      expect(allocation.bookingId).not.toBeNull();
    });
  });
});

