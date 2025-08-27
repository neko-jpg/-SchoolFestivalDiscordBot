import { SlashCommandBuilder, CommandInteraction, Role, GuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { filterMembers } from '../services/filterService';
import getPrisma from '../prisma';
import PQueue from 'p-queue';

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
        .addStringOption(option =>
            option.setName('segment')
                .setDescription('Use a saved segment to filter members.')
                .setRequired(false)
                .setAutocomplete(true))
        .addRoleOption(option =>
          option.setName('with-role')
            .setDescription('Assign to members who have this role (ignored if segment is used).')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('without-role')
            .setDescription('Do NOT assign to members who have this role (ignored if segment is used).')
            .setRequired(false)))
    .addSubcommandGroup(group =>
        group.setName('segment')
            .setDescription('Manage saved member segments.')
            .addSubcommand(subcommand =>
                subcommand.setName('save')
                    .setDescription('Save a new segment based on filter conditions.')
                    .addStringOption(option => option.setName('name').setDescription('The name of the segment.').setRequired(true))
                    .addRoleOption(option => option.setName('with-role').setDescription('Filter for members who have this role.').setRequired(true))
                    .addRoleOption(option => option.setName('without-role').setDescription('Filter for members who do NOT have this role.').setRequired(false))
            )
            .addSubcommand(subcommand =>
                subcommand.setName('list')
                    .setDescription('List all saved segments in this server.')
            )
    ),
  async autocomplete(interaction: AutocompleteInteraction) {
    const prisma = getPrisma();
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'segment') {
        const segments = await prisma.segment.findMany({
            where: {
                guildId: interaction.guildId!,
                name: {
                    startsWith: focusedOption.value,
                    mode: 'insensitive',
                },
            },
            take: 25,
        });
        await interaction.respond(
            segments.map(segment => ({ name: segment.name, value: segment.name })),
        );
    }
  },
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const prisma = getPrisma();
    const group = interaction.options.getSubcommandGroup();

    if (group === 'segment') {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'save') {
            const name = interaction.options.getString('name', true);
            const withRole = interaction.options.getRole('with-role', true);
            const withoutRole = interaction.options.getRole('without-role');

            const conditions = {
                withRoleId: withRole.id,
                withoutRoleId: withoutRole?.id || null,
            };

            try {
                await prisma.segment.create({
                    data: {
                        name,
                        guildId: interaction.guild.id,
                        conditions: conditions,
                    },
                });
                await interaction.reply({ content: `✅ Segment **${name}** has been saved.`, ephemeral: true });
            } catch (error) {
                console.error("Failed to save segment:", error);
                await interaction.reply({ content: '❌ This segment name already exists. Please choose a different name.', ephemeral: true });
            }
        } else if (subcommand === 'list') {
            const segments = await prisma.segment.findMany({
                where: { guildId: interaction.guild.id },
                orderBy: { name: 'asc' },
            });

            if (segments.length === 0) {
                await interaction.reply({ content: 'No segments have been saved in this server yet.', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('Saved Segments')
                .setColor('#3498DB');

            for (const segment of segments) {
                const conditions = segment.conditions as any;
                let description = '';
                if (conditions.withRoleId) description += `With role: <@&${conditions.withRoleId}>\n`;
                if (conditions.withoutRoleId) description += `Without role: <@&${conditions.withoutRoleId}>\n`;
                embed.addFields({ name: segment.name, value: description || 'No conditions' });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } else if (interaction.options.getSubcommand() === 'assign-bulk') {
        await interaction.reply({ content: 'Fetching members and calculating changes...', ephemeral: true });

        const roleToAssign = interaction.options.getRole('role-to-assign', true) as Role;
        const segmentName = interaction.options.getString('segment');

        let withRole: Role | null = null;
        let withoutRole: Role | null = null;
        let segmentMessage = '';

        if (segmentName) {
            const segment = await prisma.segment.findUnique({ where: { name: segmentName } });
            if (!segment) {
                await interaction.editReply({ content: `❌ Segment named **${segmentName}** not found.` });
                return;
            }
            const conditions = segment.conditions as any;
            if (conditions.withRoleId) withRole = await interaction.guild.roles.fetch(conditions.withRoleId);
            if (conditions.withoutRoleId) withoutRole = await interaction.guild.roles.fetch(conditions.withoutRoleId);
            segmentMessage = ` using segment **${segmentName}**`;

        } else {
            withRole = interaction.options.getRole('with-role', true) as Role;
            withoutRole = interaction.options.getRole('without-role') as Role | null;
            if (!withRole) {
                 await interaction.editReply({ content: 'You must provide either a segment or a `with-role` filter.' });
                return;
            }
        }

        // Fetch all members to ensure cache is up-to-date
        await interaction.guild.members.fetch();

        // First, filter out members who already have the role to be assigned
        const potentialMembers = interaction.guild.members.cache.filter(member =>
            !member.roles.cache.has(roleToAssign.id)
        );

        // Then, apply the positive and negative filters using the service
        const targetMembers = filterMembers(potentialMembers, { withRole, withoutRole });

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

        let message = `Found **${targetMembers.size}** members`;
        if (segmentName) {
            message += ` matching segment **${segmentName}**`;
        } else if (withRole) {
            message += ` with the \`@${withRole.name}\` role`;
            if (withoutRole) {
                message += `, without the \`@${withoutRole.name}\` role,`;
            }
        }
        message += ` who do not have the \`@${roleToAssign.name}\` role. Do you want to proceed?`;

        const response = await interaction.editReply({
            content: message,
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
                await i.update({ content: `Assigning role \`@${roleToAssign.name}\` to **${targetMembers.size}** members... (0% complete)`, components: [] });

                const queue = new PQueue({ concurrency: 1, interval: 1200, intervalCap: 1 });
                let successCount = 0;
                let failCount = 0;
                let processedCount = 0;
                const totalMembers = targetMembers.size;

                const updateInterval = Math.max(1, Math.floor(totalMembers / 10)); // Update every 10% or at least every 1 member

                for (const member of targetMembers.values()) {
                    queue.add(async () => {
                        try {
                            await member.roles.add(roleToAssign);
                            successCount++;
                        } catch (err) {
                            console.error(`Failed to assign role to ${member.user.tag}:`, err);
                            failCount++;
                        }
                        processedCount++;

                        if (processedCount % updateInterval === 0 || processedCount === totalMembers) {
                             const percentage = Math.round((processedCount / totalMembers) * 100);
                             await i.editReply({ content: `Assigning role \`@${roleToAssign.name}\` to **${totalMembers}** members... (${percentage}% complete)` });
                        }
                    });
                }

                await queue.onIdle();
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
