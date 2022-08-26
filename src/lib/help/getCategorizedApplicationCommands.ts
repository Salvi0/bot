import { Collection } from "@discordjs/collection"
import { container } from "@sapphire/framework"
import type { Snowflake } from "discord-api-types/v9"
import type { ApplicationCommandType } from "discord.js"
import type { CommandHelpData } from "./CommandHelpData"
import { getArgumentsFromOptionsList } from "./getArgumentsFromOptionsList"
import { getSubcommandsFromOptionsList } from "./getSubcommandsFromOptionsList"

const prefixes: Record<ApplicationCommandType, string> = {
  CHAT_INPUT: "/",
  USER: "(User) ",
  MESSAGE: "(Message) ",
}

export const getCategorizedApplicationCommands = () => {
  const entries = container.stores.get("commands").map((command) => {
    if (typeof command.detailedDescription === "string") {
      throw new TypeError(
        `The detailed description of ${command.name} is in an invalid format`,
      )
    }

    const categoryName = command.constructor.name
      .replace(/Command$/, "")
      .replace(/(?!^)[A-Z]/g, (match) => " " + match.toLocaleLowerCase())

    const commands: [Snowflake, CommandHelpData][] = []

    const commandIds = [
      ...command.applicationCommandRegistry.chatInputCommands,
      ...command.applicationCommandRegistry.contextMenuCommands,
    ].filter((command) => /^\d+$/.test(command))

    for (const id of commandIds) {
      const applicationCommand =
        container.client.application?.commands.cache.get(id)
      if (!applicationCommand) continue

      commands.push([
        applicationCommand.id,
        {
          id: applicationCommand.id,
          displayName:
            prefixes[applicationCommand.type] + applicationCommand.name,
          description:
            applicationCommand.type === "CHAT_INPUT"
              ? applicationCommand.description
              : command.detailedDescription.contextMenuCommandDescription ?? "",
          arguments: getArgumentsFromOptionsList(applicationCommand.options),
          subcommands: getSubcommandsFromOptionsList(
            applicationCommand.options,
          ),
        },
      ])
    }

    return [categoryName, new Collection(commands)] as const
  })

  return new Collection(entries.filter(([, commands]) => commands.size !== 0))
}
