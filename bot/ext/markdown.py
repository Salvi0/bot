import discord
from bot.utils import converter
from discord.ext import commands


class Markdown(commands.Cog):
    """Markdown syntax helpers"""

    @commands.command(aliases=["member"])
    @commands.cooldown(1, 3, commands.BucketType.member)
    @commands.guild_only()
    async def user(
        self, ctx: commands.Context, *, member: converter.GuildMemberConverter,
    ):
        """Gives formatting to mention a given member"""

        embed = discord.Embed(title="Syntax", description=f"`{member.mention}`")
        embed.add_field(name="Output", value=member.mention)
        embed.set_footer(text=f"ID: {member.id}")

        await ctx.send(embed=embed)

    @commands.command()
    @commands.cooldown(1, 3, commands.BucketType.member)
    @commands.guild_only()
    async def role(
        self, ctx: commands.Context, *, role: converter.GuildRoleConverter,
    ):
        """Gives formatting to mention a given role"""

        embed = discord.Embed(title="Syntax", description=f"`{role.mention}`")
        embed.add_field(name="Output", value=role.mention)
        embed.set_footer(text=f"ID: {role.id}")

        await ctx.send(embed=embed)

    @commands.command()
    @commands.cooldown(1, 3, commands.BucketType.member)
    @commands.guild_only()
    async def channel(
        self, ctx: commands.Context, *, channel: converter.GuildTextChannelConverter,
    ):
        """Gives formatting to link to a given channel"""

        embed = discord.Embed(title="Syntax", description=f"`{channel.mention}`")
        embed.add_field(name="Output", value=channel.mention)
        embed.set_footer(text=f"ID: {channel.id}")

        await ctx.send(embed=embed)

    @commands.command(aliases=["emote"])
    @commands.cooldown(1, 3, commands.BucketType.member)
    @commands.guild_only()
    async def emoji(
        self, ctx: commands.Context, *, emoji: converter.GuildPartialEmojiConverter,
    ):
        """Gives formatting to use a given server emoji"""

        guild_emoji = ctx.bot.get_emoji(emoji.id)

        embed = discord.Embed(
            title="Syntax",
            description=f"`{emoji}`"
            if guild_emoji and guild_emoji.is_usable()
            else f"*`<`*`{'a' if emoji.animated else ''}:{emoji.name}:{emoji.id}>`",
        )
        embed.add_field(name="Output", value=str(emoji))
        if guild_emoji is None or guild_emoji.guild != ctx.guild:
            embed.add_field(
                name="Warning",
                value="Emoji is from another server, please make sure the "
                '@everyone role has the "Use External Emojis" permission in '
                "the target channel in order to send it in a webhook message.",
                inline=False,
            )
        if guild_emoji is None:
            embed.add_field(
                name="Note",
                value="Bot does not have access to send this emoji, but emoji "
                "will appear when sent in a webhook message.",
                inline=False,
            )
        embed.set_footer(text=f"ID: {emoji.id}")

        await ctx.send(embed=embed)


def setup(bot):
    bot.add_cog(Markdown(bot))