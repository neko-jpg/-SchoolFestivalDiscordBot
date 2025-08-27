import { Client, TextChannel } from 'discord.js';
import cron from 'node-cron';
import { getCalendarEvents } from './utils/googleCalendar';

const REMINDER_CHANNEL_ID = process.env.REMINDER_CHANNEL_ID;
const REMINDER_MINUTES_BEFORE = 15;

const remindedEventIds = new Set<string>();

async function checkEventsAndSendReminders(client: Client) {
  if (!REMINDER_CHANNEL_ID) {
    console.warn('REMINDER_CHANNEL_ID not set. Skipping reminders.');
    return;
  }

  const { events, error } = await getCalendarEvents();
  if (error || !events) {
    console.error('Could not fetch calendar events for reminder:', error);
    return;
  }

  const now = new Date();
  const reminderTimeLimit = new Date(now.getTime() + REMINDER_MINUTES_BEFORE * 60 * 1000);

  for (const event of events) {
    if (!event.id || !event.start?.dateTime || remindedEventIds.has(event.id)) {
      continue;
    }

    const eventStartTime = new Date(event.start.dateTime);
    if (eventStartTime > now && eventStartTime <= reminderTimeLimit) {
      try {
        const channel = await client.channels.fetch(REMINDER_CHANNEL_ID);
        if (channel && channel instanceof TextChannel) {
          const time = eventStartTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          await channel.send(`【まもなく開始！】 **${time}** から **${event.summary}** が始まります！ @everyone`);
          remindedEventIds.add(event.id);
        }
      } catch (e) {
        console.error('Failed to send reminder:', e);
      }
    }
  }
}

export function startReminderCronJob(client: Client) {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    console.log('Running scheduled event reminder check...');
    checkEventsAndSendReminders(client);
  });

  console.log('Event reminder cron job started.');
}
