import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';

const alertTemplates = {
  fire: '🚨 **火災発生** 🚨\n@everyone\nただちに避難を開始してください。避難経路を確認し、落ち着いて行動してください。',
  medical: '🏥 **急病人発生** 🏥\n@everyone\n救護班は至急本部へ集合してください。周囲の方は救護活動にご協力ください。',
  weather: '⛈️ **荒天警報** ⛈️\n@everyone\n天候悪化のため、屋外での企画は一時中断します。屋内に待機してください。',
  lostchild: '👶 **迷子のお知らせ** 👶\n@everyone\n迷子が発生しました。特徴は「（ここに特徴を記入）」です。お心当たりの方は本部までご連絡ください。',
};

type AlertType = keyof typeof alertTemplates;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('safety')
    .setDescription('Manages emergency alerts.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('alert')
        .setDescription('Posts an emergency alert.')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('The type of alert to send.')
            .setRequired(true)
            .addChoices(
              { name: 'Fire - 火災', value: 'fire' },
              { name: 'Medical - 急病人', value: 'medical' },
              { name: 'Weather - 荒天', value: 'weather' },
              { name: 'Lost Child - 迷子', value: 'lostchild' }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.options.getSubcommand() === 'alert') {
      const alertType = interaction.options.getString('type', true) as AlertType;
      const message = alertTemplates[alertType];

      if (message) {
        await interaction.reply({ content: `次の緊急アラートを送信します:\n\n${message}` , ephemeral: true });
        // Using a more direct check to satisfy the type checker.
        if (interaction.channel && 'send' in interaction.channel) {
          await interaction.channel.send(message);
        }
      } else {
        await interaction.reply({ content: 'Invalid alert type selected.', ephemeral: true });
      }
    }
  },
};
