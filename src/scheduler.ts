import { Client, TextChannel } from 'discord.js';
import cron from 'node-cron';
import { getCalendarEvents } from './utils/googleCalendar';
import prisma from './prisma';

const REMINDER_MINUTES_BEFORE = 15;

// イベントIDがどのギルドでリマインドされたかを記録する
// これにより、同じイベントが複数のギルドでリマインドされるのを防ぐ
const remindedEventGuilds = new Map<string, Set<string>>();

async function checkEventsAndSendReminders(client: Client) {
  // すべてのサーバー設定を取得
  const configs = await prisma.guildConfig.findMany();

  // 設定があるサーバーごとにループ処理
  for (const config of configs) {
    if (!config.reminderChannelId || !config.googleCalendarId) {
      continue; // チャンネルやカレンダーが設定されていなければスキップ
    }

    // データベースから取得したカレンダーIDを使う
    const { events, error } = await getCalendarEvents(config.googleCalendarId);
    if (error || !events) {
      console.error(`Could not fetch calendar events for guild ${config.guildId}:`, error);
      continue;
    }

    const now = new Date();
    const reminderTimeLimit = new Date(now.getTime() + REMINDER_MINUTES_BEFORE * 60 * 1000);

    for (const event of events) {
      if (!event.id || !event.start?.dateTime) {
        continue;
      }

      // このギルドでこのイベントが既にリマインド済みかチェック
      if (remindedEventGuilds.get(event.id)?.has(config.guildId)) {
        continue;
      }

      const eventStartTime = new Date(event.start.dateTime);
      if (eventStartTime > now && eventStartTime <= reminderTimeLimit) {
        try {
          const channel = await client.channels.fetch(config.reminderChannelId);
          if (channel instanceof TextChannel) {
            const time = eventStartTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            await channel.send(`【まもなく開始！】 **${time}** から **${event.summary}** が始まります！ @everyone`);

            // リマインド済みとして記録
            if (!remindedEventGuilds.has(event.id)) {
              remindedEventGuilds.set(event.id, new Set());
            }
            remindedEventGuilds.get(event.id)?.add(config.guildId);
          }
        } catch (e) {
          console.error(`Failed to send reminder for guild ${config.guildId}:`, e);
        }
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
