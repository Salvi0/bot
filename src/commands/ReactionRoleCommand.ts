import {
  bold,
  hyperlink,
  roleMention,
  SlashCommandBuilder,
} from "@discordjs/builders"
import { PaginatedMessageEmbedFields } from "@sapphire/discord.js-utilities"
import {
  ApplicationCommandRegistry,
  PieceContext,
  RegisterBehavior,
} from "@sapphire/framework"
import { Subcommand } from "@sapphire/plugin-subcommands"
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v9"
import {
  CommandInteraction,
  GuildBasedChannel,
  MessageEmbed,
  ThreadChannel,
} from "discord.js"
import { BOT_EMBED_COLOR } from "../lib/constants"
import { getEmojiKey } from "../lib/emojis/getEmojiKey"
import { parseReactionOption } from "../lib/emojis/parseReactionOption"
import { parseMessageOption } from "../lib/messages/parseMessageOption"
import { removeCacheEntry } from "../lib/storage/removeCacheEntry"
import type { GuildData } from "../lib/types/GuildData"
import type { ReactionRoleData } from "../lib/types/ReactionRoleData"

export class ReactionRoleCommand extends Subcommand {
  constructor(context: PieceContext) {
    super(context, {
      name: "reaction-role",
      runIn: ["GUILD_ANY"],
      requiredUserPermissions: PermissionFlagsBits.ManageRoles,
      subcommands: [
        {
          name: "list",
          chatInputRun: "listRun",
        },
        {
          name: "create",
          chatInputRun: "createRun",
        },
        {
          name: "delete",
          chatInputRun: "deleteRun",
        },
        {
          name: "verify",
          chatInputRun: "verifyRun",
        },
      ],
      detailedDescription: {},
    })
  }

  async listRun(interaction: CommandInteraction) {
    await interaction.deferReply({ ephemeral: true })

    const channel = interaction.options.getChannel("channel")

    let queryBuilder = this.container
      .database<ReactionRoleData>("reaction_roles")
      .where({ guild_id: interaction.guild!.id })
      .orderBy("message_id")
    if (channel) queryBuilder = queryBuilder.where({ channel_id: channel.id })
    const reactionRoles = await queryBuilder

    const reactionRolesByMessage: ReactionRoleData[][] = []
    for (const reactionRole of reactionRoles) {
      if (reactionRolesByMessage.length === 0) {
        reactionRolesByMessage.push([reactionRole])
        continue
      }

      const last = reactionRolesByMessage[reactionRolesByMessage.length - 1]
      if (last[0].message_id === reactionRole.message_id) {
        last.push(reactionRole)
      } else {
        reactionRolesByMessage.push([reactionRole])
      }
    }

    if (reactionRoles.length === 0) {
      await interaction.editReply({
        embeds: [
          new MessageEmbed()
            .setTitle("Reaction roles")
            .setDescription(
              `It seems like you don't have any reaction roles yet. Use ` +
                `${bold("/reaction-role create")} to create one.`,
            )
            .setColor(BOT_EMBED_COLOR),
        ],
      })
      return
    }

    await new PaginatedMessageEmbedFields()
      .setTemplate(
        new MessageEmbed()
          .setTitle("Reaction roles")
          .setDescription(
            `Use ${bold("/reaction-role create")} to create a new reaction ` +
              `role or ${bold("/reaction-role delete")} to delete an ` +
              `existing reaction role.`,
          )
          .setColor(BOT_EMBED_COLOR),
      )
      .setItems(
        reactionRolesByMessage.map((reactionRoles) => {
          const duplicate = reactionRolesByMessage.some(
            (other) =>
              other[0].channel_id === reactionRoles[0].channel_id &&
              other[0].message_id !== reactionRoles[0].message_id,
          )

          const channel = interaction.guild!.channels.cache.get(
            reactionRoles[0].channel_id,
          )
          const channelName = channel
            ? channel.isThread()
              ? channel.name
              : `#${channel.name}`
            : "unknown channel or thread"

          const messageLink = [
            "https://discord.com/channels",
            reactionRoles[0].guild_id,
            reactionRoles[0].channel_id,
            reactionRoles[0].message_id,
          ].join("/")

          return {
            name: duplicate
              ? `Message ${reactionRoles[0].message_id} in ${channelName}`
              : `Message in ${channelName}`,
            value:
              hyperlink("Jump to message", messageLink) +
              "\n\n" +
              reactionRoles
                .map((reactionRole) => {
                  const emoji =
                    this.container.client.emojis.cache.get(
                      reactionRole.reaction,
                    ) ?? reactionRole.reaction

                  return `${emoji}: ${roleMention(reactionRole.role_id)}`
                })
                .join("\n"),
          }
        }),
      )
      .setItemsPerPage(5)
      .make()
      .run(interaction)
  }

  async createRun(interaction: CommandInteraction) {
    await interaction.deferReply({ ephemeral: true })

    const message = await parseMessageOption(interaction)
    if (!message) return

    const canReact = (message.channel as GuildBasedChannel)
      .permissionsFor(interaction.guild!.me!)
      .has("ADD_REACTIONS")
    if (!canReact) {
      await interaction.editReply({
        content: "I'm missing permission to react in this channel.",
      })
      return
    }

    const emoji = await parseReactionOption(interaction)
    if (!emoji) return

    if (
      message.reactions.cache.size >= 20 &&
      !message.reactions.cache.has(getEmojiKey(emoji))
    ) {
      await interaction.editReply({
        content: "There don't fit any more reactions on this message.",
      })
      return
    }

    const role = interaction.options.getRole("role", true)

    if (role.managed || interaction.guild!.roles.everyone.id === role.id) {
      await interaction.editReply({
        content: "This role is cannot be manually assigned to members.",
      })
      return
    }

    await message.react(emoji)
    if (message.channel instanceof ThreadChannel && message.channel.joinable) {
      await message.channel.join()
    }

    await this.container
      .database<GuildData>("guilds")
      .insert({
        guild_id: interaction.guild!.id,
      })
      .onConflict()
      .ignore()

    try {
      await this.container.database<ReactionRoleData>("reaction_roles").insert({
        message_id: message.id,
        channel_id: message.channel.id,
        guild_id: interaction.guild!.id,
        role_id: role.id,
        reaction: getEmojiKey(emoji),
      })

      const cacheKey = `reaction-role:${message.id}:${getEmojiKey(emoji)}`
      removeCacheEntry(cacheKey)

      await interaction.editReply({
        content: `Reaction role successfully created. Anyone reacting with ${emoji} to ${hyperlink(
          "this message",
          message.url,
        )} will now get assigned the ${role} role.`,
      })
    } catch {
      await interaction.editReply({
        content:
          "A reaction role for the emoji on that message already exists.",
      })
    }
  }

  async deleteRun(interaction: CommandInteraction) {
    await interaction.deferReply({ ephemeral: true })

    const message = await parseMessageOption(interaction)
    if (!message) return
    const emoji = await parseReactionOption(interaction)
    if (!emoji) return

    const reaction = message.reactions.cache.get(getEmojiKey(emoji))
    await reaction?.users.remove()

    await this.container
      .database<GuildData>("guilds")
      .insert({
        guild_id: interaction.guild!.id,
      })
      .onConflict()
      .ignore()

    const [reactionRole] = await this.container
      .database<ReactionRoleData>("reaction_roles")
      .where({
        message_id: message.id,
        reaction: getEmojiKey(emoji),
      })
      .delete()
      .returning("*")

    if (!reactionRole) {
      await interaction.editReply({
        content: "The reaction role specified did not exist.",
      })
      return
    }

    const cacheKey = `reaction-role:${message.id}:${getEmojiKey(emoji)}`
    removeCacheEntry(cacheKey)

    await interaction.editReply({
      content: `Reaction role successfully deleted. Anyone reacting with ${emoji} to ${hyperlink(
        "this message",
        message.url,
      )} will no longer get assigned the ${roleMention(
        reactionRole.role_id,
      )} role.`,
    })
  }

  async verifyRun(interaction: CommandInteraction) {
    await interaction.deferReply({ ephemeral: true })

    const guild = interaction.guild!

    if (!guild.me?.permissions.has("MANAGE_ROLES")) {
      await interaction.editReply({
        embeds: [
          new MessageEmbed()
            .setTitle("Reaction roles")
            .setDescription(
              "It looks like I don't have access to manage roles in this " +
                "server. Please give me the permission and run this command " +
                "again to continue.",
            )
            .setColor(BOT_EMBED_COLOR),
        ],
      })
      return
    }

    const reactionRoles = await this.container
      .database<ReactionRoleData>("reaction_roles")
      .where({ guild_id: guild.id })
      .orderBy("message_id")

    if (reactionRoles.length === 0) {
      await interaction.editReply({
        embeds: [
          new MessageEmbed()
            .setTitle("Reaction roles")
            .setDescription(
              `It seems like you don't have any reaction roles yet. Use ` +
                `${bold("/reaction-role create")} to create one.`,
            )
            .setColor(BOT_EMBED_COLOR),
        ],
      })
      return
    }

    const errors = new Set<string>()

    for (const reactionRole of reactionRoles) {
      const messageLink = [
        "https://discord.com/channels",
        reactionRoles[0].guild_id,
        reactionRoles[0].channel_id,
        reactionRoles[0].message_id,
      ].join("/")

      const channel = guild.channels.cache.get(reactionRole.channel_id)
      if (!channel) {
        errors.add(
          "I can't see the channel " +
            `${hyperlink("this message", messageLink)} belongs to. ` +
            "If this message is in an archived thread please unarchive it to" +
            "to allow me to respond to reactions. If this message is in a " +
            "deleted channel please contact support to get it removed.",
        )
        continue
      }

      const permissions = channel.permissionsFor(guild.me!)
      if (
        !channel.isText() ||
        !permissions.has(["VIEW_CHANNEL", "READ_MESSAGE_HISTORY"])
      ) {
        errors.add(
          `I don't have permission to see messages in ${channel}. Make sure ` +
            "I have permissions to view the channel and read the message " +
            "history to let me see live reactions.",
        )
        continue
      }

      try {
        await channel.messages.fetch(reactionRole.message_id)
      } catch {
        errors.add(
          `${hyperlink("This message", messageLink)} appears to have been ` +
            "deleted. If this is not the case Discord might be experiencing " +
            "some issues right now. If it is deleted you can contact support " +
            "to have this entry removed.",
        )
        continue
      }

      const role = guild.roles.cache.get(reactionRole.role_id)
      if (!role) {
        errors.add(
          `The role for ${reactionRole.reaction} on ` +
            `${hyperlink("this message", messageLink)} appears to have been ` +
            "deleted.",
        )
        continue
      }

      if (!role.editable) {
        errors.add(
          `I can't assign people the ${roleMention(reactionRole.role_id)} ` +
            "role because it's placed higher in the role list. Please move " +
            `the ${guild.roles.botRoleFor(guild.me!)} above any reaction ` +
            `role to make sure all reaction roles work.`,
        )
        continue
      }
    }

    const embed = new MessageEmbed()
      .setTitle("Reaction role verification")
      .addFields(
        ...Array.from(errors).map((error, index) => ({
          name: `Error ${index + 1}`,
          value: error,
        })),
      )
      .setColor(BOT_EMBED_COLOR)

    if (errors.size === 0) {
      embed.setDescription(
        "I was not able to detect any errors in your server. If you're " +
          "experiencing issues make sure that my role is higher than the " +
          "highest role of whoever is trying to use the reaction role. If " +
          "you still need help feel free to reach out at the support server, " +
          `which can be found in ${bold("/help")}.`,
      )
    }

    await interaction.editReply({
      embeds: [embed],
    })
  }

  override async registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand(
      new SlashCommandBuilder()
        .setName("reaction-role")
        .setDescription("Reaction role management commands.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List existing reaction roles in the server.")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription(
                  "Limit the list to reaction roles in the given channel only.",
                )
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildNews,
                  ChannelType.GuildNewsThread,
                  ChannelType.GuildPublicThread,
                  ChannelType.GuildPrivateThread,
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("create")
            .setDescription("Create a new reaction role in the server.")
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription(
                  "The message link where the reaction role should be created.",
                )
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("emoji")
                .setDescription("The emoji the reaction role should use.")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription(
                  "The role that should be given when someone activates the reaction role.",
                )
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("delete")
            .setDescription("Delete an existing reaction role in the server.")
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription(
                  "The message link where the reaction role should be deleted.",
                )
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("emoji")
                .setDescription("The emoji the reaction role has.")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("verify")
            .setDescription(
              "Verifies the permissions in this server to make sure reaction roles work.",
            ),
        ),
      {
        guildIds: process.env.GUILD_ID ? [process.env.GUILD_ID] : undefined,
        behaviorWhenNotIdentical: RegisterBehavior.Overwrite,
      },
    )
  }
}
