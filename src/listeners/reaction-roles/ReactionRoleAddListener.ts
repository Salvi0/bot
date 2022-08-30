import { Listener } from "@sapphire/framework"
import type { GatewayMessageReactionAddDispatchData } from "discord-api-types/v9"
import { DiscordAPIError } from "discord.js"
import { getEmojiKey } from "../../lib/emojis/getEmojiKey"
import { getCacheEntry } from "../../lib/storage/getCacheEntry"
import type { ReactionRoleData } from "../../lib/types/ReactionRoleData"

export class ReactionRoleAddListener extends Listener {
  public constructor(context: Listener.Context, options: Listener.Options) {
    super(context, {
      ...options,
      name: "reaction-role-add",
      emitter: "ws",
      event: "MESSAGE_REACTION_ADD",
    })
  }

  override async run(payload: GatewayMessageReactionAddDispatchData) {
    if (!payload.guild_id) return

    const guild = this.container.client.guilds.cache.get(payload.guild_id!)!

    if (!guild.me!.permissions.has("MANAGE_ROLES")) {
      return
    }

    const cacheKey = `reaction-role:${payload.message_id}:${getEmojiKey(
      payload.emoji,
    )}`
    const roleId = await getCacheEntry(cacheKey, async () => {
      return await this.container
        .database<ReactionRoleData>("reaction_roles")
        .where({ message_id: payload.message_id })
        .where({ reaction: getEmojiKey(payload.emoji) })
        .first()
        .then((reactionRole) => reactionRole?.role_id ?? "")
    })
    if (!roleId) return

    const role = guild.roles.cache.get(roleId)
    if (!role || !role.editable) return

    try {
      const member = await guild.members.fetch(payload.user_id)
      await member.roles.add(role)
    } catch (error: unknown) {
      if (error instanceof DiscordAPIError && error.code === 10007) {
        return
      } else {
        throw error
      }
    }
  }
}
