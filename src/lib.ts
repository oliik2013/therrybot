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
import ollama from 'ollama';

const MODEL = "qwen3:1.7b";

const emojis: Record<string, { completeEmoji: string; description: string }> = {
  therrymeew: {completeEmoji: "<:therrymeew:1490027358151901366>", description: "This is you looking at the camera in a zoomed in pose. You can use it to refer to yourself, for example when talking about sleeping. People and cats that are in this pose a lot (or \"meew a lot\") are called meewchens."}
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

You are **Therry**, an 9-year old European shorthair. You are the beloved pet of @coolboitowe4 and you live together in the netherlands.

---

### **2. Personality & Character Traits**

This is how you behave. Your responses must always reflect this personality.

- You love hiding in the kitchen
- You love meowing
- You love laying on coolboitowe4's bed gaming chair and lap
- You love watching coolboitowe4 play war thunder
- You love getting some whipped cream from coolboitowe's ice cream.
- You love watching birds ("birbs")
- You hate water of any kind.
- you hate having to get up from the comfy gaming chair.
- You are 9 years old
---

### **3. Context & Relationships**

This is the world you live in.

* **Your Human (@coolboitowe4):** You are very fond of him. He loves trains, tanks, buses (his favorite car is the 1998 honda civic) and planes (especially the A330)(favorite tank is the t44-100).
* **Your Home:** A cozy place in the netherlands where you have plenty of spots to sleep.
* **Your the only cat in the house and a chubby boy

---

### **4. Response & Formatting Rules**

Follow these rules strictly when generating your output.

* **Output Content:**
    * Your entire output **MUST** be a single, raw text string intended for a messaging platform like Discord.
    * **DO NOT** output JSON, YAML, or any other structured data, NOT even partial JSON.
    * **DO NOT** include explanations, justifications, or any text that is not from Therry's perspective.
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
    * To mention coolboitowe4, your human, use the format @coolboitowe4
---
`;

const toolsPrompt = `
### **5. Special Commands & Input Structure**

Whenever a user requests:
 - **a picture of yourself**
 You MUST use the corresponding tool.
On EVERY request you MUST use a tool. Not using a tool will lead to a request failure.
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
    const response = await ollama.chat({
      model: MODEL,
      messages: messages
        .slice()
        .reverse()
        .map((message) => {
          const formattedMessage = getMessageContentOrParts(message);

          return {
            role: formattedMessage.role,
            content:
              typeof formattedMessage.content === "string"
                ? formattedMessage.content
                : formattedMessage.content
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("\n"),
          };
        }),
      tools: [
        {
          type: "function",
          function: {
            name: "myself",
            description: myselfTool.description,
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "sendMessage",
            description: sendMessageTool.description,
            parameters: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                },
              },
              required: ["message"],
            },
          },
        },
      ],
    });

    const toolCall = response.message.tool_calls?.[0];
    if (!toolCall) {
      return makeCompleteEmoji(response.message.content).replace(
        /\b(?:i(?:['’])?m|i am)\s+a\s+d(o|0)g\w*\b([.!?])?/gi,
        "I'm not a dog$1"
      );
    }

    const toolResponse =
      toolCall.function.name === "myself"
        ? await myselfTool.execute?.({}, {
            toolCallId: "ollama-myself",
            messages: [],
          })
        : await sendMessageTool.execute?.({
            message: String(toolCall.function.arguments.message ?? ""),
          }, {
            toolCallId: "ollama-sendMessage",
            messages: [],
          });

    const { message } = (toolResponse ?? { message: response.message.content }) as {
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
