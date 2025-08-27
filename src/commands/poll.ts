import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, TextChannel } from 'discord.js';

const choiceEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Creates and manages polls.')
    .addSubcommand(subcommand => {
      subcommand
        .setName('create')
        .setDescription('Creates a new poll.')
        .addStringOption(option => option.setName('question').setDescription('The poll question').setRequired(true));
      // Add up to 10 choices
      for (let i = 1; i <= 10; i++) {
        subcommand.addStringOption(option => option.setName(`choice${i}`).setDescription(`Choice ${i}`).setRequired(i <= 2));
      }
      return subcommand;
    })
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Closes a poll and shows the results.')
        .addStringOption(option => option.setName('message_id').setDescription('The message ID of the poll to close').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.channel) return;

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'create') {
        const question = interaction.options.getString('question', true);
        const choices = [];
        for (let i = 1; i <= 10; i++) {
          const choice = interaction.options.getString(`choice${i}`);
          if (choice) {
            choices.push(choice);
          }
        }

        const embed = new EmbedBuilder()
          .setColor('#3498DB')
          .setTitle(question)
          .setDescription(choices.map((c, i) => `${choiceEmojis[i]} ${c}`).join('\n'));

        const pollMessage = await interaction.reply({ embeds: [embed], fetchReply: true });

        for (let i = 0; i < choices.length; i++) {
          await pollMessage.react(choiceEmojis[i]);
        }
      } else if (subcommand === 'close') {
        const messageId = interaction.options.getString('message_id', true);

        const pollMessage = await interaction.channel.messages.fetch(messageId);
        if (!pollMessage || pollMessage.author.id !== interaction.client.user.id) {
            await interaction.reply({ content: 'Could not find a valid poll with that message ID.', ephemeral: true});
            return;
        }

        const pollEmbed = pollMessage.embeds[0];
        if (!pollEmbed) {
            await interaction.reply({ content: 'The specified message does not contain a valid poll embed.', ephemeral: true});
            return;
        }

        const results = [];
        const choices = pollEmbed.description?.split('\n') || [];

        for (const line of choices) {
            const emoji = line.match(/([\u{1f1e6}-\u{1f1ff}\u{1f300}-\u{1f5ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f900}-\u{1f9ff}\u{1f018}-\u{1f270}])/u);
            if (emoji) {
                const reaction = pollMessage.reactions.cache.get(emoji[0]);
                const count = reaction ? reaction.count - 1 : 0; // Subtract bot's own reaction
                results.push({ choice: line, count });
            }
        }

        results.sort((a, b) => b.count - a.count);

        const resultsEmbed = new EmbedBuilder()
            .setColor('#992D22')
            .setTitle(`Results for: ${pollEmbed.title}`)
            .setDescription(results.map(r => `${r.choice}: **${r.count} votes**`).join('\n'));

        await interaction.reply({ embeds: [resultsEmbed] });

        const closedEmbed = EmbedBuilder.from(pollEmbed).setFooter({text: 'This poll is now closed.'});
        await pollMessage.edit({ embeds: [closedEmbed] });
      }
    } catch (error) {
      console.error('Poll command error:', error);
      await interaction.reply({ content: 'An error occurred while handling the poll.', ephemeral: true });
    }
  },
};
