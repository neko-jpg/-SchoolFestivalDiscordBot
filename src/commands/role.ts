import { SlashCommandBuilder, CommandInteraction, Role, GuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Commands for managing roles.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('assign-bulk')
        .setDescription('Assign a role to multiple members based on a filter.')
        .addRoleOption(option =>
          option.setName('role-to-assign')
            .setDescription('The role to be assigned to the members.')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('with-role')
            .setDescription('Assign to members who have this role.')
            .setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;

    if (interaction.options.getSubcommand() === 'assign-bulk') {
        await interaction.reply({ content: 'Fetching members and calculating changes...', ephemeral: true });

        const roleToAssign = interaction.options.getRole('role-to-assign', true) as Role;
        const withRole = interaction.options.getRole('with-role', true) as Role;

        // Fetch all members to ensure cache is up-to-date
        await interaction.guild.members.fetch();

        const targetMembers = interaction.guild.members.cache.filter(member =>
            member.roles.cache.has(withRole.id) && // Member has the 'with-role'
            !member.roles.cache.has(roleToAssign.id) // Member does not already have the 'role-to-assign'
        );

        if (targetMembers.size === 0) {
            await interaction.editReply({ content: 'No members found matching the criteria. No roles will be assigned.' });
            return;
        }

        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm-assign')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel-assign')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

        const response = await interaction.editReply({
            content: `Found **${targetMembers.size}** members with the \`@${withRole.name}\` role who do not have the \`@${roleToAssign.name}\` role. Do you want to proceed?`,
            components: [row]
        });

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: 'You cannot use these buttons.', ephemeral: true });
                return;
            }

            collector.stop();
            if (i.customId === 'confirm-assign') {
                await i.update({ content: `Assigning role \`@${roleToAssign.name}\` to **${targetMembers.size}** members... This may take a moment.`, components: [] });

                let successCount = 0;
                let failCount = 0;

                for (const member of targetMembers.values()) {
                    try {
                        await member.roles.add(roleToAssign);
                        successCount++;
                    } catch (err) {
                        console.error(`Failed to assign role to ${member.user.tag}:`, err);
                        failCount++;
                    }
                }

                await i.editReply({ content: `**Operation Complete!**\n- Successfully assigned role to **${successCount}** members.\n- Failed to assign role to **${failCount}** members.` });

            } else if (i.customId === 'cancel-assign') {
                await i.update({ content: 'Operation cancelled.', components: [] });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.editReply({ content: 'Confirmation timed out. No roles were assigned.', components: [] });
            }
        });
    }
  },
};
