import { google } from 'googleapis';

// Helper to get calendar events
export async function getCalendarEvents(calendarId: string) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { error: 'Google Calendar credentials not configured.' };
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
      calendarId: calendarId,
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
