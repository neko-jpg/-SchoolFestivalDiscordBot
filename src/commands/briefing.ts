import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import axios from 'axios';
import { getCalendarEvents } from '../utils/googleCalendar';

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

// Helper to get weather data
async function getWeather(location: string = 'Tokyo') {
  if (!WEATHER_API_KEY) return 'Weather API key not configured.';
  try {
    const response = await axios.get(`https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${location}&days=1&aqi=no&alerts=no`);
    const { current, forecast } = response.data;
    const forecastDay = forecast.forecastday[0].day;
    return `**${response.data.location.name}**: ${current.condition.text}, ${Math.round(current.temp_c)}°C (最高: ${Math.round(forecastDay.maxtemp_c)}°C / 最低: ${Math.round(forecastDay.mintemp_c)}°C)`;
  } catch (error) {
    console.error('Weather API Error:', error);
    return '天気情報を取得できませんでした。';
  }
}

function formatCalendarEvents(events: any[] | undefined) {
    if (!events || events.length === 0) {
        return '本日の予定はありません。';
    }
    return events.map(event => {
        const start = event.start?.dateTime || event.start?.date;
        const time = start ? new Date(start).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '終日';
        return `**${time}** - ${event.summary}`;
    }).join('\n');
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('briefing')
    .setDescription('Manages daily briefings.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('post')
        .setDescription('Posts the daily briefing with live data.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.options.getSubcommand() === 'post') {
      await interaction.deferReply();

      const calendarResult = await getCalendarEvents();
      const weather = await getWeather();

      const schedule = calendarResult.error ? calendarResult.error : formatCalendarEvents(calendarResult.events);
      const notes = '13時以降は体育館への搬入禁止（静的メッセージ）';

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`【本日のブリーフィング】 ${new Date().toLocaleDateString('ja-JP')}`)
        .addFields(
          { name: '天気', value: weather },
          { name: '本日のスケジュール', value: schedule },
          { name: '運営注意事項', value: notes }
        )
        .setTimestamp()
        .setFooter({ text: '文化祭実行委員会' });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
