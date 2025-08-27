import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import getPrisma from '../prisma';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// --- Configuration ---
// Using path.resolve to ensure the path is correct regardless of execution context.
const assetsPath = path.resolve(process.cwd(), 'assets');
// User must provide a map.png in the assets directory.
const baseMapPath = path.join(assetsPath, 'map.png');
// User must provide these dot images in the assets directory.
const overlayImages = {
  1: path.join(assetsPath, 'green_dot.png'), // Low
  2: path.join(assetsPath, 'yellow_dot.png'), // Medium
  3: path.join(assetsPath, 'red_dot.png'), // High
};
const locations = {
  'Main Gate': { top: 100, left: 150 },
  'Gymnasium': { top: 250, left: 300 },
  'Courtyard': { top: 400, left: 200 },
};
// --- End Configuration ---

type LocationName = keyof typeof locations;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('congestion')
    .setDescription('Manages real-time congestion map.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('report')
        .setDescription('Report the congestion level at a location.')
        .addStringOption(option =>
          option.setName('location')
            .setDescription('The location you are reporting from.')
            .setRequired(true)
            .addChoices(...Object.keys(locations).map(loc => ({ name: loc, value: loc })))
        )
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('The congestion level.')
            .setRequired(true)
            .addChoices(
              { name: '🟢 Low', value: 1 },
              { name: '🟡 Medium', value: 2 },
              { name: '🔴 High', value: 3 }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View the current congestion map.')
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();
    const prisma = getPrisma();

    try {
      if (subcommand === 'report') {
        const location = interaction.options.getString('location', true) as LocationName;
        const level = interaction.options.getInteger('level', true);

        await prisma.congestionReport.create({
          data: {
            location,
            level,
            reporterId: interaction.user.id,
          },
        });
        await interaction.reply({ content: `Successfully reported **${location}** as level **${level}** congestion.`, ephemeral: true });
      } else if (subcommand === 'view') {
        // --- Pre-flight Check for Assets ---
        const requiredAssets = [baseMapPath, ...Object.values(overlayImages)];
        const missingAssets = requiredAssets.filter(p => !fs.existsSync(p));

        if (missingAssets.length > 0) {
            const missingFiles = missingAssets.map(p => path.basename(p)).join(', ');
            await interaction.reply({
                content: `❌ **Asset Error:** The following required image files are missing on the server: \`${missingFiles}\`.\nPlease ask the administrator to place them in the \`assets\` directory.`,
                ephemeral: true
            });
            return;
        }
        // --- End Check ---

        await interaction.deferReply();

        const latestReports = await prisma.congestionReport.findMany({
          distinct: ['location'],
          orderBy: { createdAt: 'desc' },
        });

        if (latestReports.length === 0) {
          await interaction.editReply('No congestion data available. The map is clear!');
          return;
        }

        const compositeOperations = latestReports.map(report => {
          const overlayPath = overlayImages[report.level as keyof typeof overlayImages];
          const coords = locations[report.location as LocationName];
          return {
            input: overlayPath,
            top: coords.top,
            left: coords.left,
          };
        });

        const imageBuffer = await sharp(baseMapPath)
          .composite(compositeOperations)
          .png()
          .toBuffer();

        const attachment = new AttachmentBuilder(imageBuffer, { name: 'congestion-map.png' });
        await interaction.editReply({ files: [attachment] });
      }
    } catch (error) {
      console.error('Congestion command error:', error);
      if (error instanceof Error && error.message.includes('Input file is missing')) {
          await interaction.followUp('Error: The map image file (`assets/map.png`) or dot images are missing on the server. Please contact an administrator.');
      } else {
          await interaction.followUp({ content: 'An error occurred while handling the congestion command.', ephemeral: true });
      }
    }
  },
};
