import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("therry")
    .setDescription("Sends a random image of Therry"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const imageResponse = await fetch(
      "https://therryapi-cat-api.sigmatwojastara.workers.dev/raw"
    );
    const imageData = Buffer.from(await imageResponse.arrayBuffer());
    console.log(imageData.length);
    await interaction.followUp({ files: [imageData] });
  },
};
