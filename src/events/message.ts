import { Message, type OmitPartialGroupDMChannel } from "discord.js";
import type { ClientType } from "../types.ts";
import { genMistyOutput } from "../lib.ts";
import { ratelimit, redis } from "../utils/redis.ts";

async function recursivelyFetchMessage(
  message: Message,
  limit: number
): Promise<Message[]> {
  const messages: Message[] = [message];
  let currentMessage = message;
  let count = 0;

  while (currentMessage.reference?.messageId && count < limit) {
    const nextMessage = await currentMessage.channel.messages.fetch(
      currentMessage.reference.messageId
    );
    if (
      nextMessage.content.length === 0 &&
      nextMessage.attachments.size >= 1 &&
      nextMessage.author.id == process.env.BOT_CLIENT_ID
    )
      nextMessage.content =
        "{{MYSELF}} - Already responded. You do NOT need to send {{MYSELF}} again.";

    messages.push(nextMessage);
    currentMessage = nextMessage;
    count++;
  }

  return messages;
}

export default {
  eventType: "messageCreate",
  async execute(
    client: ClientType,
    message: OmitPartialGroupDMChannel<Message<boolean>>
  ) {
    if (message.author.bot) return;

    const completeMessageReference = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference?.messageId)
      : null;

    if (
      !message.content.includes(`<@${client.user?.id}>`) &&
      completeMessageReference?.author.id !== client.user?.id
    )
      return;
    const isUserBlacklisted = await redis.get(`blacklist:${message.author.id}`);
    if (isUserBlacklisted) {
      await message.reply("I don't wanna talk to you D:<");
      return;
    }
    const { success, reset } = await ratelimit.limit(message.author.id);

    if (!success) {
      return await message.reply(
        `You ran out of messages! Retry <t:${Math.floor(reset / 1000)}:R>`
      );
    }
    try {
      await message.channel.sendTyping();
    } catch {
      console.log("Failed to send typing bruh");
    }
    const messages = await recursivelyFetchMessage(message, 10);

    const output = await genMistyOutput(messages, client, message);
    console.log(output);
    if (output?.includes("{{MYSELF}}")) {
      const imageResponse = await fetch("https://therryapi-cat-api.sigmatwojastara.workers.dev/raw");
      const imageData = Buffer.from(await imageResponse.arrayBuffer());
      await message.reply({ files: [imageData] });
      return;
    }
    if (!output) return;
    await message.reply({
        content: output
          .replace("@everyone", "I TRIED TO PING EVERYONE AND FAILED LMFAOOOOO")
          .replace("@here", "I TRIED TO PING HERE AND FAILED LMFAOOOOO"),
        allowedMentions: { roles: [], parse: ["roles", "users"] },
      });
  },
};
