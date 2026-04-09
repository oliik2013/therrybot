import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";
import type { CommandType } from "../../types.ts";

const OWNER_ID = process.env.OWNER_ID;

const command: CommandType = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement to multiple channels (Owner only)")
    .addStringOption((option) =>
      option
        .setName("targets")
        .setDescription("List of channel mentions like #announcements (one per line or semicolon-separated)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The announcement message")
        .setRequired(true)
    ) as CommandType["data"],
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({
        content: "❌ You don't have permission to use this command! Only the bot owner can announce.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetsInput = interaction.options.getString("targets", true);
    const message = interaction.options.getString("message", true);

    const targets = targetsInput
      .split(/[;\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const match = t.match(/^<#(\d+)>$/);
        return match ? match[1] : null;
      })
      .filter((channelId): channelId is string => channelId !== null);

    if (targets.length === 0) {
      await interaction.reply({
        content: "❌ No valid targets provided. Mention channels like #announcements.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const results: { guild: string; channel: string; success: boolean }[] = [];
    const channelCache = new Map<string, Awaited<ReturnType<typeof interaction.client.channels.fetch>>>();

    await interaction.reply({
      content: `📢 Sending announcement to ${targets.length} channel(s)...`,
      flags: MessageFlags.Ephemeral,
    });

    for (const channelId of targets) {
      try {
        const cachedChannel = channelCache.get(channelId);
        const channel = cachedChannel ?? (await interaction.client.channels.fetch(channelId));

        if (!cachedChannel) {
          channelCache.set(channelId, channel);
        }

        if (
          !channel?.isTextBased() ||
          !("guild" in channel) ||
          !("send" in channel) ||
          !("name" in channel)
        ) {
          results.push({ guild: "Unknown guild", channel: channelId, success: false });
          continue;
        }

        await channel.send(message);
        results.push({ guild: channel.guild.name, channel: channel.name, success: true });
      } catch (error) {
        console.error("Error sending to", channelId, error);
        results.push({ guild: "Unknown guild", channel: channelId, success: false });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    const responseText = [
      `✅ Successfully sent to ${successCount} channel(s):`,
      ...results
        .filter((r) => r.success)
        .map((r) => `  • ${r.guild} #${r.channel}`),
      failCount > 0 ? `\n❌ Failed to send to ${failCount} channel(s):` : null,
      ...results
        .filter((r) => !r.success)
        .map((r) => `  • ${r.guild} #${r.channel}`),
    ]
      .filter(Boolean)
      .join("\n");

    await interaction.editReply({
      content: responseText,
    });
  },
  async autocomplete() {
    // No autocomplete needed
  },
};

export default command;
