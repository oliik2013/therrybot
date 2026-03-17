import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { increaseLimit, ratelimit } from "../../utils/redis.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("limit")
    .setDescription("Gets info about your ratelimit"),
  async execute(interaction: ChatInputCommandInteraction) {
    const { remaining, reset } = await ratelimit.getRemaining(
      interaction.user.id
    );
    const raiseButton = new ButtonBuilder()
      .setCustomId("limit")
      .setLabel("Ask someone12345656657 for more limits")
      .setStyle(ButtonStyle.Primary)
      .setDisabled()
      .setEmoji("🐈");
    const contentComponent = new TextDisplayBuilder().setContent(
      `You have ${remaining} remaining messages. Resets <t:${Math.floor(
        reset / 1000
      )}:R>.`
    );
    const actionRow = new ActionRowBuilder()
      .addComponents([raiseButton])
      .toJSON();
    const response = await interaction.reply({
      components: [contentComponent, actionRow],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      withResponse: true,
    });

    const confirmation =
      await response.resource?.message?.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      });
    console.log(confirmation);
    if (confirmation?.customId === "limit") {
      const { success } = await increaseLimit.limit(interaction.user.id);
      if (!success) {
        await confirmation.reply({
          content: "You have already requested a reset today.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const starNumber = await interaction.client.users.fetch(
        process.env.OWNER_ID ?? ""
      );
      await starNumber.send(
        `<@${
          interaction.user.id
        }> has ${remaining} remaining messages. Resets <t:${Math.floor(
          reset / 1000
        )}:R>. He would like to have his limit reset.`
      );
      await confirmation.reply({
        content:
          "I asked someone12345656657 for a reset on your behalf. Please wait for a few minutes (or until he's online).",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
