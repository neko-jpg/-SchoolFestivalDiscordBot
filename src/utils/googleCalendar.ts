import { google } from 'googleapis';

const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

// Helper to get calendar events
export async function getCalendarEvents() {
  if (!GOOGLE_CALENDAR_ID || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { error: 'Google Calendar not configured.' };
  }
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: today.toISOString(),
      timeMax: tomorrow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return { events: res.data.items || [] };

  } catch (error) {
    console.error('Google Calendar API Error:', error);
    return { error: 'Could not retrieve schedule from Google Calendar.' };
  }
}
