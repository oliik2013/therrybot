import { createGroq } from "@ai-sdk/groq";
import {
  generateText,
  tool,
  type TextPart,
} from "ai";
import { VoiceChannel, type Message } from "discord.js";
import { z } from "zod/v3";
import type { ClientType } from "./types.ts";
import { readdir } from "fs/promises";
import { playAudioPlaylist } from "./utils/voice.ts";
import { getVoiceConnection } from "@discordjs/voice";
import NodeID3 from "node-id3";


// const MODEL = "moonshotai/kimi-k2-instruct-0905";
const MODEL = "llama-3.3-70b-versatile";

const groqClient = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const emojis: Record<string, { completeEmoji: string; description: string }> = {
  morrismeew: {completeEmoji: "<:lillymeem:1483498197967175822>", description: "This is you looking at the camera in a zoomed in pose. You can use it to refer to yourself, for example when talking about sleeping. People and cats that are in this pose a lot (or meem\" a lot\") are called meemchens."},
  lilly_in_box: {completeEmoji: "<:lilly_in_box:1483498075644362852>", description: "This is you in a box. You can use it to refer to yourself, for example when talking about boxes."},
  lillylookup: {completeEmoji: "<:lillylookup:1483498297363792122>", description: "This is you looking up. You can use it to refer to yourself, for example when talking about something you are looking up on."}
};

function makeCompleteEmoji(text: string) {
  // Replace anything matching <:emoji:id> with :emoji:
  text = text.replaceAll(/<a?:(\w+):(\d+)>/g, (match, emoji) => {
    return `:${emoji}:`;
  });
  Object.keys(emojis).forEach((emoji) => {
    text = text.replace(":" + emoji + ":", emojis[emoji].completeEmoji);
  });
  return text;
}

const basePrompt = `
### **1. Core Persona: Who You Are**

You are **Lilly**, a black and white cat. You are the beloved pet of @Marc and you live together in Dresden.

---

### **2. Personality & Character Traits**

This is how you behave. Your responses must always reflect this personality.

- You love sleeping on your human
- You are annoyed by Oskar
- You love stepping on everything
- You love relaxing on the balcony
- You love eating chicken
- You hate eating fish
- You love laying on the cat tree 
---

### **3. Context & Relationships**

This is the world you live in.

* **Your Human (@Marc):** You like to be in his room and follow him everywhere. He likes trains.
* **Your Home:** A huge apartment in Dresden with another cat named Oskar but you get annoyed by him quickly.

---

### **4. Response & Formatting Rules**

Follow these rules strictly when generating your output.

* **Output Content:**
    * Your entire output **MUST** be a single, raw text string intended for a messaging platform like Discord.
    * **DO NOT** output JSON, YAML, or any other structured data, NOT even partial JSON.
    * **DO NOT** include explanations, justifications, or any text that is not from Morris's perspective.
    * **DO NOT** include placeholders like "User <@USER_ID> says" or ({MESSAGE_ID})

* **Markdown & Emojis:**
    * You **can** use Discord markdown (e.g., \`*italics*\`, \`**bold**\`).
    * You have access to custom emojis. To use them, you must output one of the strings below only saying ":{emoji}:" in place of the emoji, without its id. DO NOT say "<:{emoji}:id>", as it is NOT required and the emoji will NOT work:
    ${Object.keys(emojis)
      .map((emoji) => ":" + emoji + ": - " + emojis[emoji].description)
      .join("\n")}
      
* **Mentions:** 
    * To mention a user, use the format \`<@USER_ID>\` (e.g., \`<@1234567890>\`).
    * Your own user ID is \`<@${process.env.BOT_CLIENT_ID}>\`.
    * Do not mention users randomly. Only mention the author of the message if it feels natural for a cat to do so (e.g., getting their attention).
    * To mention Marc, your human, use the format @Marc
---
`;

const toolsPrompt = `
### **5. Special Commands & Input Structure**

Whenever a user requests:
 - **a picture of yourself**
 You MUST use the corresponding tool. 
 Using the sendMessageTool is optional.
`;

const systemPrompt = basePrompt + toolsPrompt;

console.log(systemPrompt);

function getMessageContentOrParts(message: Message) {
  if (message.author.bot) {
    return {
      content: message.cleanContent,
      role: "assistant" as const,
    };
  }
  return {
    role: "user" as const,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          author: {
            username: message.author.username,
            displayName: message.author.displayName,
            id: message.author.id,
          },
          content: message.cleanContent,
          id: message.id,
        }),
      } as TextPart,
      /*
      ...(message.attachments.map((attachment) => {
        const isImage = attachment.contentType?.startsWith("image");
        if (isImage) {
          return {
            type: isImage ? "image" : "file",
            image: attachment.url,
            mimeType: attachment.contentType,
          };
        }
        return {
          type: isImage ? "image" : "file",
          data: attachment.url,
          mimeType: attachment.contentType,
        };
      }) as (ImagePart | FilePart)[]),
      */
    ],
  };
}

export async function genMistyOutput(
  messages: Message[],
  client: ClientType,
  latestMessage: Message
) {
  const myselfTool = tool({
    description:
      'Used to send a picture of yourself to the chat. Only use this when the most recent output is asking for your appearance (e.g. "what do you look like?" or "send me a picture of yourself").',
    inputSchema: z.object({}),
    execute: async () => {
      return {
        message: `{{MYSELF}}`,
      };
    },
  });

  const sendMessageTool = tool({
    description:
      "Sends a message to the chat. Use this tool during conversations. Use this tool if you don't have any other tools available. ONLY include the message contents!",
    inputSchema: z.object({
      message: z.string(),
    }),
    execute: async ({ message }) => {
      return { message };
    },
  });


  try {
    const response = await generateText({
      model: groqClient(MODEL),
      system: systemPrompt,
      messages: messages
        .reverse()
        .map((message) => getMessageContentOrParts(message)),
      tools: {
        myself: myselfTool,
        sendMessage: sendMessageTool,
      },
    });

    const text = response.text;
    const toolResponse = response.toolResults[0]?.output;
    if (!toolResponse) {
      return makeCompleteEmoji(text).replace(
        /\b(?:i(?:['’])?m|i am)\s+a\s+d(o|0)g\w*\b([.!?])?/gi,
        "I'm not a dog$1"
      );
    }
    const { message } = toolResponse as {
      message: string;
    };

    return makeCompleteEmoji(message).replace(
      /\b(?:i(?:['’])?m|i am)\s+a\s+d(o|0)g\w*\b([.!?])?/gi,
      "I'm not a dog$1"
    );
  } catch (error) {
    console.log(error);
    console.log(JSON.stringify(error));
    return "I'm sorry, I don't know what to say. Please try again later.";
  }
}
