import type {
  BaseCommandInteraction,
  MessageComponentInteraction,
  WebhookMessageOptions,
} from "discord.js"

export const reply = async (
  interaction: BaseCommandInteraction | MessageComponentInteraction,
  options: Omit<WebhookMessageOptions, "username" | "avatarURL" | "flags">,
  ephemeral = true,
) => {
  if (interaction.replied) {
    await interaction.followUp({ ...options, ephemeral })
  } else if (interaction.deferred) {
    if (ephemeral && !interaction.ephemeral) {
      await interaction.editReply({ content: "\u200b" })
      await interaction.followUp({ ...options, ephemeral })
      return
    }
    await interaction.editReply({ ...options })
  } else {
    await interaction.reply({ ...options, ephemeral })
  }
}
