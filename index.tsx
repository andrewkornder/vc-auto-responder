/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { DeleteIcon } from "@components/Icons";
import twemoji from "@twemoji/api";
import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { useForceUpdater } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
    Constants,
    EmojiStore,
    RestAPI,
    TextInput,
    UserStore,
    useState,
} from "@webpack/common";



type ARReactionEmoji = { custom: boolean, name: string, id: string; unicode: string; preview: string; };
type ResponseTemplate = {
    channelIds: Array<string>,
    userIds: Array<string>,
    stickerFilter: Array<string>,
    regex: { pattern: string, flags: string; },
    reply: boolean,

    message: string,
    sticker: string,
    reaction: ARReactionEmoji,
};

const logger = new Logger("AutoResponder");

const RESPONSE_KEY = "autoresponse-responses";
let responses: Array<ResponseTemplate> = [];

const cl = classNameFactory("autoresponse-");

function CollapsibleEntry({ title, children, deleter }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={cl("template-entry")}>
            <div className={cl("template-header")}>
                <Button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cl("template-title")}>
                    <div className={cl("template-collabsible-title")}>
                        <div className={cl("template-collabsible-button")}>{isOpen ? "▼" : "▶"}</div>
                        <Heading tag="h4">{title}</Heading>
                    </div>
                </Button>
                <Button onClick={deleter} className={cl("delete-entry")}><DeleteIcon /></Button>
            </div>
            {isOpen &&
                <div className={cl("template-params")}>
                    {children}
                </div>}
        </div>
    );
}

function IDList({ title, list, onChange }) {
    const [value, setValue] = useState((list ?? []).join(","));

    return (
        <>
            <Heading tag="h4">{title}</Heading>
            <TextInput
                placeholder="Comma-separated IDs"
                spellCheck={false}
                value={value}
                onChange={async e => {
                    e = (e as string).replaceAll(/[^\d,]/g, "");
                    await onChange(e.split(","));
                    setValue(e);
                }}
            />
        </>
    );
}
function StringParam({ title, param, placeholder, onChange }) {
    const [value, setValue] = useState(param);

    return (
        <>
            <Heading tag="h4">{title}</Heading>
            <TextInput
                placeholder={placeholder}
                spellCheck={true}
                value={value}
                onChange={async e => {
                    await onChange(e);
                    setValue(e);
                }}
            />
        </>
    );
}
function RegexInput({ title, regex, onChange }) {
    const [value, setValue] = useState(regex);

    return (
        <>
            <Heading tag="h4">{title}</Heading>
            <div className={cl("regex-field-container")}>
                <div className={cl("regex-field-pattern")}>
                    <TextInput
                        placeholder="^(?:string)$"
                        spellCheck={false}
                        value={value.pattern}
                        onChange={async e => {
                            regex.pattern = e;
                            await onChange(regex);
                            setValue(regex);
                        }}
                    />
                </div>
                <TextInput
                    placeholder="i"
                    spellCheck={false}
                    value={value.flags}
                    onChange={async e => {
                        regex.flags = e;
                        await onChange(regex);
                        setValue(regex);
                    }}
                />
            </div>
        </>
    );
}

const { convertNameToSurrogate } = findByPropsLazy("convertNameToSurrogate");

function EmojiInput({ title, emoji, onChange }) {
    const update = useForceUpdater();

    emoji.preview = emoji.preview ?? "";
    const [value] = useState(emoji);

    const header = <Heading tag="h4">{title}</Heading>;
    const custom_switch = <FormSwitch title="Custom" value={value.custom} onChange={async () => {
        console.log("reset emoji with custom:", emoji.custom);
        value.custom = !value.custom;
        emoji = { custom: value.custom, name: "", unicode: "", id: "", preview: "" };
        await onChange(emoji);
        update();
    }} hideBorder={true} />;
    const inputs = value.custom ? <TextInput
        placeholder="ID"
        spellCheck={false}
        value={value.id}
        onChange={async e => {
            emoji.id = (e as string).replaceAll(/\D/g, "");
            const result = EmojiStore.getCustomEmojiById(e);
            if (result !== undefined) {
                emoji.name = result.name;
                emoji.preview = `https://cdn.discordapp.com/emojis/${emoji.id}.webp?animated=true`;
            } else {
                emoji.name = "";
                emoji.preview = "";
            }
            await onChange(emoji);
            update();
        }}
    /> : <TextInput
        placeholder="name"
        spellCheck={false}
        value={value.name}
        onChange={async e => {
            e = (e as string).replaceAll(/[^a-z_]/g, "");
            const result = convertNameToSurrogate(e);

            const codepoint = twemoji.convert.toCodePoint(result);
            if (result !== undefined && codepoint !== undefined && codepoint.length !== 0) {
                emoji.name = e;
                emoji.unicode = result;
                emoji.id = codepoint;
                emoji.preview = `https://github.com/twitter/twemoji/blob/master/assets/72x72/${emoji.id}.png?raw=true`;
                // `https://twemoji.maxcdn.com/v/latest/72x72/${emoji.id}.svg`
            } else {
                emoji.name = e;
                emoji.unicode = "";
                emoji.id = "";
                emoji.preview = "";
            }
            await onChange(emoji);
            update();
        }}
    />;

    const preview_div = value.custom ?
        (emoji.id.length !== 0) && <div className={cl("emoji-input-preview")}>{
            emoji.preview.length === 0 ?
                <p>{`Custom Emoji with ID ${emoji.id} not found`}</p> :
                <p>{`:${emoji.name}: with ID ${emoji.id} = `}<img src={emoji.preview} width={32} height={32} alt={`:${emoji.name}:`} /></p>
        }</div> :
        (emoji.name.length !== 0) && <div className={cl("emoji-input-preview")}>{
            emoji.preview.length === 0 ?
                <p>{`Standard emoji :${emoji.name}: not found`}</p> :
                <p>{`:${emoji.name}: with code point ${emoji.id} = `}<img src={emoji.preview} width={32} height={32} alt={`:${emoji.name}:`} /></p>
        }</div>;

    return (
        <>
            {header}
            <div className={cl("emoji-field-container")}>{inputs} {custom_switch}</div>
            {preview_div}
        </>
    );
}

function ResponseTemplateEntries() {
    const update = useForceUpdater();
    const [templates] = useState(responses);

    async function onChangeLocal() {
        await DataStore.set(RESPONSE_KEY, responses);
        update();
    }

    const elements = templates.map((template: ResponseTemplate, index: number) => {
        return (
            <>
                <CollapsibleEntry title={`Template #${index + 1}`} deleter={async () => {
                    templates.splice(index, 1);
                    onChangeLocal();
                }}>
                    <IDList title="Channel IDs (whitelist)" list={template.channelIds} onChange={async value => {
                        responses[index].channelIds = value ?? [];
                        await onChangeLocal();
                    }} />
                    <IDList title="User IDs (allows all if empty)" list={template.userIds} onChange={async value => {
                        responses[index].userIds = value ?? [];
                        await onChangeLocal();
                    }} />
                    <IDList title="Reply if has sticker(s)" list={template.stickerFilter} onChange={async value => {
                        responses[index].stickerFilter = value ?? [];
                    }} />
                    <RegexInput title="Regex Whitelist"
                        regex={template.regex}
                        onChange={async (regex: { pattern: string; flags: string; }) => {
                            responses[index].regex = regex;
                            await onChangeLocal();
                        }} />
                    <StringParam title="Message Content"
                        placeholder=""
                        param={template.message}
                        onChange={async (value: string) => {
                            responses[index].message = value;
                            await onChangeLocal();
                        }}
                    />
                    <EmojiInput title="Reaction" emoji={template.reaction} onChange={async (emoji: ARReactionEmoji) => {
                        responses[index].reaction = emoji;
                        await onChangeLocal();
                    }} />
                    <FormSwitch title="Reply to message" value={template.reply} onChange={async () => {
                        template.reply = !template.reply;
                        await onChangeLocal();
                    }} hideBorder={true} />
                </CollapsibleEntry>
            </>
        );
    });
    return (
        <>
            {elements}
            <div><Button onClick={async () => {
                responses.push({
                    channelIds: [],
                    userIds: [],
                    stickerFilter: [],
                    regex: { pattern: "", flags: "" },
                    reply: true,
                    message: "",
                    sticker: "",
                    reaction: { custom: false, name: "", id: "", unicode: "", preview: "" }
                });
                await onChangeLocal();
            }}>Add Template</Button></div>
        </>
    );
}


const settings = definePluginSettings({
    responses: {
        description: "The templates/filters for the responder",
        type: OptionType.COMPONENT,
        component: () => <ResponseTemplateEntries />
    }
});


function trySendResponseToMessage(guildId, channelId, message) {
    const user = UserStore.getCurrentUser();
    const channel = channelId;
    const { content, id, stickerItems } = message;
    const author = message.author.id;

    for (const [filter_index, filter] of responses.entries()) {
        const { channelIds, userIds, stickerFilter, regex, reply: doReply, message: replyContent, sticker, reaction } = filter;
        if (reaction.name.length === 0 && sticker.length === 0 && message.length === 0) {
            continue;
        }

        if (!channelIds.includes(channel)) {
            continue;
        }
        if (userIds.length !== 0 && !userIds.includes(author)) {
            continue;
        }

        const reason: Array<string> = [];
        if (regex.pattern.length !== 0) {
            try {
                if (!content.match(new RegExp(regex.pattern, regex.flags))) {
                    reason.push("regex did not match");
                }
            } catch {
                reason.push("regex threw error");
            }
        }

        if (stickerFilter.length !== 0) {
            let foundSticker = false;
            for (const sticker of (stickerItems ?? [])) {
                if (stickerFilter.includes(sticker.id)) {
                    foundSticker = true;
                    break;
                }
            }
            if (!foundSticker) {
                reason.push("sticker whitelist did not match");
            }
        }

        if (reason.length !== 0) {
            logger.log(`Message did not match filter #${1 + filter_index} for reasons: ${reason.join(", ")}`, message, filter);
            continue;
        }

        logger.log("Responding to message", {
            id: id,
            channel: channel,
            content: content,
            stickers: stickerItems,
            author_id: author,
            author: message.author.username,
        });

        if (reaction.name.length !== 0) {
            logger.log(`Reacting to message ${id} with emoji ${reaction.name} with id ${reaction.id}`);
            RestAPI.put({
                url: Constants.Endpoints.REACTIONS(channel, id, reaction.name + (reaction.id ? `:${reaction.id}` : "")) + "/%40me",
                body: {
                    location: "Message Hover Bar",
                    type: 0
                },
                retries: 0,
            }).catch(err => logger.error(err));
        }
        if (sticker.length !== 0 || message.length !== 0) {
            logger.log(`Replying to message ${id} with message "${replyContent}" and stickers [${sticker}]`);
            sendMessage(channelId, {
                content: replyContent
            }, true, {
                messageReference: doReply ? {
                    guild_id: guildId,
                    channel_id: channel,
                    message_id: id
                } : undefined,
                stickerIds: sticker.length !== 0 ? [sticker] : []
            });
        }
        return true;
    }
    return false;
}



export default definePlugin({
    name: "AutoResponder",
    description: "Automatically responds to certain messages",
    authors: [{ name: "dash", id: 548007774840160260n }],
    settings,

    flux: {
        MESSAGE_CREATE: event => { trySendResponseToMessage(event.guildId, event.channelId, event.message); },
    },

    commands: [
        {
            name: "here",
            description: "Show information about this location and/or users",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],

            execute: async (_, ctx) => {
                logger.log("Getting information about context:", ctx);

                const { channel, guild: server } = ctx;
                let info = "";
                if (server !== undefined) {
                    info += `Server "${server.name}" with ID ${server.id}\n`;
                }
                if (channel.name.length !== 0) {
                    info += `Channel "${channel.name}" with ID ${channel.id}\n`;
                } else {
                    info += `Channel ID ${channel.id}\n`;
                }
                if (channel.parent_id !== undefined) {
                    info += `Parent: ${channel.parent_id}\n`;
                }
                if (channel.memberCount !== undefined) {
                    info += `${channel.memberCount} members\n`;
                }

                if (channel.rawRecipients !== undefined) {
                    for (const { id, username } of channel.rawRecipients) {
                        info += `- ${username} with ID ${id}\n`;
                    }
                }

                sendBotMessage(ctx.channel.id, {
                    content: info
                });
            }
        }
    ],

    async start() {
        responses = await DataStore.get(RESPONSE_KEY) ?? [];
        await DataStore.set(RESPONSE_KEY, responses);
    },
});
