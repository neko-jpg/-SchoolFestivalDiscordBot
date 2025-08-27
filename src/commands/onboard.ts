import { SlashCommandBuilder, CommandInteraction, GuildMember } from 'discord.js';

const questions = [
  {
    prompt: 'あなたの学年を教えてください。(例: 1年生, 2年生)',
    rolePrefix: '', // No prefix for grade roles, they should match exactly
  },
  {
    prompt: 'あなたの所属する係を教えてください。(例: 舞台係, 模擬店係)',
    rolePrefix: '', // No prefix for committee roles either
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('onboard')
    .setDescription('Starts the onboarding process for new members.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Starts the interactive onboarding process.')
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) {
      // Command must be run in a server
      return;
    }

    if (interaction.options.getSubcommand() === 'start') {
      try {
        await interaction.reply({
          content: 'オンボーディングプロセスを開始します。質問をDMに送信しました！',
          ephemeral: true
        });

        const dmChannel = await interaction.user.createDM();
        const member = interaction.member as GuildMember;
        const collectedRoles = [];

        for (const question of questions) {
          await dmChannel.send(question.prompt);
          const filter = (m: any) => m.author.id === interaction.user.id;
          const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
          const answer = collected.first()?.content.trim();

          if (!answer) {
            await dmChannel.send('時間切れです。もう一度 `/onboard start` からやり直してください。');
            return;
          }

          const roleNameToFind = `${question.rolePrefix}${answer}`;
          const role = interaction.guild?.roles.cache.find(r => r.name === roleNameToFind);

          if (role) {
            collectedRoles.push(role);
          } else {
            await dmChannel.send(`「${roleNameToFind}」というロールが見つかりませんでした。運営者に確認してください。`);
          }
        }

        if (collectedRoles.length > 0) {
          await member.roles.add(collectedRoles);
          const assignedRoles = collectedRoles.map(r => r.name).join(', ');
          await dmChannel.send(`オンボーディング完了！あなたに次のロールを付与しました: ${assignedRoles}`);
        } else {
          await dmChannel.send('付与できるロールが見つかりませんでした。最初からやり直してください。');
        }

      } catch (error) {
        console.error('Onboarding DM error:', error);
        // Let the user know something went wrong in the DM
        try {
          await interaction.user.send('おっと、何か問題が発生したようです。もう一度試すか、運営者に連絡してください。');
        } catch (dmError) {
            console.error('Failed to send error DM:', dmError)
        }
      }
    }
  },
};
