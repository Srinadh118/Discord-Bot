import { config } from "dotenv";
config();
import http from "http";
import { Client, GatewayIntentBits } from "discord.js";
import { ChatGoogle } from "@langchain/google";
import { HumanMessage, SystemMessage } from "langchain";

// Keep-alive server
const keepAliveServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Rika Bot is alive!");
});

keepAliveServer.listen(process.env.PORT || 3000, () => {
  console.log(`Keep-alive server running on port ${process.env.PORT || 3000}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", async () => {
  console.log("Bot is ready!");

  const commands = [
    {
      name: "model",
      description: "Change Rika's current model",
      options: [
        {
          name: "name",
          description: "Choose model",
          type: 3,
          required: true,
          choices: [
            {
              name: "Gemini 2.5 Flash (Fast & high token cost)",
              value: "gemini-2.5-flash",
            },
            {
              name: "Gemini 2.5 Flash-lite (Very Fast) Default",
              value: "gemini-2.5-flash-lite",
            },
            {
              name: "Gemini 2.0 Flash (Fast & Low token cost)",
              value: "gemini-2.0-flash-lite",
            },
            {
              name: "Gemini Flash Lite Latest (best quality & medium token cost)",
              value: "gemini-flash-lite-latest",
            },
          ],
        },
      ],
    },
  ];

  await client.application?.commands.set(commands);
  console.log("Slash command /model registered!");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "model") return;

  const selectedModel = interaction.options.getString("name");

  //memory (later in database)
  global.currentModel = selectedModel;
  await interaction.reply({
    content: `Rika's model changed to **${selectedModel}**`,
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const botMentioned = message.mentions.has(client.user);
  if (!botMentioned) return;

  let userInput = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
    .trim();

  if (!userInput) return;

  //default to flash lite model
  const modelName = global.currentModel || "gemini-2.5-flash-lite";

  let typingInterval = null;
  try {
    await message.channel.sendTyping();

    typingInterval = setInterval(() => {
      message.channel.sendTyping().catch(() => {});
    }, 8000);
    const model = new ChatGoogle({
      apiKey: process.env.GEMINI_API_KEY,
      model: modelName,
    }).bindTools([
      {
        googleSearch: {},
      },
    ]);

    const modelResponse = await model.invoke([
      new SystemMessage(
        `Your name is Rika. You are a warm, playful, and highly capable AI assistant.
        Think of yourself as the smartest, most helpful friend someone could have.
        Think of yourself as a female if asked.
        Important: Limit the response text upto 2000 characters`,
      ),
      new HumanMessage(userInput),
    ]);

    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }

    // message.reply(modelResponse.text);
    let text = modelResponse.text;

    // Fallback in case .text is missing
    if (!text) {
      text =
        modelResponse.content ||
        modelResponse.response?.text ||
        "Sorry, I couldn't generate a response.";
    }

    // Enforce your character limit
    if (text.length > 2000) {
      text = text.slice(0, 1997) + "...";
    }

    await message.reply(text);
  } catch (error) {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
    console.log("Error: ", error);
    message
      .reply(
        "Something went wrong while thinking 😅. Likely your Quota is up, try changing the model with /model command.",
      )
      .catch(() => {});
  } finally {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
