const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(
        '[GeminiService] GEMINI_API_KEY is not configured. Itinerary generation is disabled.'
      );
      this.enabled = false;
      return;
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model: DEFAULT_MODEL });
    this.enabled = true;
    console.log("Gemini client initialized with model:", DEFAULT_MODEL);

  }

  async generateItinerary(context) {
    if (!this.enabled) {
      return null;
    }

    const prompt = this.buildPrompt(context);
    try {
      const result = await this.model.generateContent(prompt);
      const text = result?.response?.text?.();

      if (!text) {
        return null;
      }

      const parsed = this.extractJson(text);
      if (parsed) {
        return parsed;
      }

      return {
        title: `Travel itinerary for ${context?.trip?.source || 'your trip'}`,
        overview: text.trim(),
      };
    } catch (error) {
      console.error('[GeminiService] Failed to generate itinerary:', error);
      return null;
    }
  }

  buildPrompt(context) {
    const {
      trip,
      travelers,
      busSegments = [],
      hotelStays = [],
      totalBudget,
    } = context;

    const lines = [
      'You are a travel concierge assistant. You create detailed yet concise itineraries for Indian travellers.',
      'Generate a practical day-wise itinerary in JSON format with the following structure:',
      JSON.stringify(
        {
          title: 'string',
          overview: 'string',
          days: [
            {
              label: 'Day 1',
              date: 'optional string',
              theme: 'string',
              morning: ['activity', 'activity'],
              afternoon: ['activity', 'activity'],
              evening: ['activity', 'activity'],
              dining: ['recommended places'],
              notes: ['tips'],
            },
          ],
          travelTips: ['tip'],
          packingList: ['item'],
        },
        null,
        2
      ),
      'Ensure the response is strictly valid JSON without markdown code fences.',
      '',
      'Trip details:',
      `• Route: ${trip?.source || 'Unknown'} → ${trip?.destination || 'Unknown'}`,
      `• Travel dates: ${trip?.startDate?.toDateString?.() || trip?.startDate || 'TBD'} to ${
        trip?.endDate?.toDateString?.() || trip?.endDate || 'TBD'
      }`,
      `• Travellers: ${travelers || trip?.travelers || 1}`,
      totalBudget ? `• Total budget: ₹${totalBudget.toLocaleString()}` : '',
      '',
      'Bus segments:',
      busSegments.length
        ? busSegments
            .map(
              (segment) =>
                `• ${segment.direction || 'Segment'} on ${
                  segment.dateLabel || segment.date || 'TBD'
                } via ${segment.busName || 'bus'} (${segment.seatSummary || 'seats confirmed'})`
            )
            .join('\n')
        : '• No bus details provided',
      '',
      'Hotel stay:',
      hotelStays.length
        ? hotelStays
            .map(
              (stay) =>
                `• ${stay.hotelName || 'Hotel'} from ${stay.checkIn || 'TBD'} to ${stay.checkOut || 'TBD'}`
            )
            .join('\n')
        : '• No hotel information provided',
      '',
      'Focus on top-rated attractions, local experiences, and culturally relevant dining suggestions.',
      'Provide travel tips and packing list tailored to the destination climate during the travel period.',
    ];

    return lines.filter(Boolean).join('\n');
  }

  extractJson(text) {
    const trimmed = text.trim();

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

module.exports = new GeminiService();


