// src/commands/poll.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

const choiceEmojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('投票を作成・集計します')
    .addSubcommand(sc =>
      sc.setName('create')
        .setDescription('投票を作成')
        .addStringOption(o => o.setName('question').setDescription('質問').setRequired(true))
        .addStringOption(o => o.setName('choice1').setDescription('選択肢1').setRequired(true))
        .addStringOption(o => o.setName('choice2').setDescription('選択肢2').setRequired(true))
        .addStringOption(o => o.setName('choice3').setDescription('選択肢3'))
        .addStringOption(o => o.setName('choice4').setDescription('選択肢4'))
        .addStringOption(o => o.setName('choice5').setDescription('選択肢5'))
        .addStringOption(o => o.setName('choice6').setDescription('選択肢6'))
        .addStringOption(o => o.setName('choice7').setDescription('選択肢7'))
        .addStringOption(o => o.setName('choice8').setDescription('選択肢8'))
        .addStringOption(o => o.setName('choice9').setDescription('選択肢9'))
        .addStringOption(o => o.setName('choice10').setDescription('選択肢10'))
    )
    .addSubcommand(sc =>
      sc.setName('close')
        .setDescription('投票を締め切って結果を表示')
        .addStringOption(o => o.setName('message_id').setDescription('投票メッセージID').setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const question = interaction.options.getString('question', true);
      const choices: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const c = interaction.options.getString(`choice${i}`);
        if (c) choices.push(c);
      }
      if (choices.length < 2) {
        await interaction.reply({ content: '少なくとも2つの選択肢が必要です。', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(question)
        .setDescription(choices.map((c, i) => `${choiceEmojis[i]} ${c}`).join('\n'));

      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      for (let i = 0; i < choices.length; i++) { await msg.react(choiceEmojis[i]); }

    } else if (sub === 'close') {
      const messageId = interaction.options.getString('message_id', true);
      const pollMessage = await interaction.channel!.messages.fetch(messageId).catch(() => null);

      if (!pollMessage || pollMessage.author.id !== interaction.client.user!.id) {
        await interaction.reply({ content: '有効な投票メッセージが見つかりません。', ephemeral: true });
        return;
      }

      const pollEmbed = pollMessage.embeds[0];
      if (!pollEmbed?.description) {
        await interaction.reply({ content: '投票の埋め込みが見つかりません。', ephemeral: true });
        return;
      }

      const lines = pollEmbed.description.split('\n');
      const results: { emoji: string; choice: string; count: number }[] = [];

      for (const line of lines) {
        const [emoji, ...rest] = line.trim().split(' ');
        const choiceText = rest.join(' ');
        if (!choiceEmojis.includes(emoji)) continue;

        const reaction = pollMessage.reactions.resolve(emoji) ?? pollMessage.reactions.cache.get(emoji);
        const count = reaction ? Math.max(0, reaction.count - 1) : 0; // Botの初期リアクション分を差し引く
        results.push({ emoji, choice: choiceText, count });
      }

      results.sort((a, b) => b.count - a.count);

      const resultEmbed = new EmbedBuilder()
        .setColor(0x992D22)
        .setTitle(`結果: ${pollEmbed.title ?? '投票'}`)
        .setDescription(
          results.length
            ? results.map(r => `${r.emoji} ${r.choice}: **${r.count}票**`).join('\n')
            : '投票はありませんでした。'
        );

      await interaction.reply({ embeds: [resultEmbed] });

      const closed = EmbedBuilder.from(pollEmbed).setFooter({ text: 'この投票は締め切られました。' });
      await pollMessage.edit({ embeds: [closed], components: [] }).catch(() => {});
    }
  },
};
