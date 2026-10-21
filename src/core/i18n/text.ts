// Display text versus stored identity. A `MessageLike` renders through a translator, while
// the code that keys on a name (series ids, persisted option values, script-readable
// titles) reads its English source text, which no locale pack or override can change.
import { ENGLISH_SETTINGS } from '../format/formatters';
import { formatMessageNumber, localizeAscii } from '../format/numbers';
import { formatMessage, type MessageValues } from './icu';
import { englishTranslator, formatSettingsOf, isMessageDescriptor } from './translator';
import type { MessageLike, Translator } from './types';

const ENGLISH_RUNTIME = {
    locale: 'en',
    formatNumber: (value: number, style?: string): string => formatMessageNumber(value, ENGLISH_SETTINGS, style),
};

/**
 * The English source text of display text, with its bound values: what identities key on.
 * Registered packs and `messages` overrides never change it. A plain string comes back as is.
 */
export function sourceText(message: MessageLike | null | undefined, values?: MessageValues): string {
    if (message == null) return '';
    if (typeof message === 'string') return message;
    if (!isMessageDescriptor(message)) return String(message);
    const bound = message.values;
    const all = bound ? (values ? { ...bound, ...values } : bound) : values;
    try {
        return formatMessage(message.defaultMessage, all, ENGLISH_RUNTIME);
    } catch {
        return message.defaultMessage;
    }
}

/** Display text through `i18n`, or in English when no translator is at hand. */
export function textOf(i18n: Translator | null | undefined, message: MessageLike, values?: MessageValues): string {
    return (i18n ?? englishTranslator()).t(message, values);
}

/** Upper-case text by the casing rules of `locale` (Turkish dotted İ, …); a tag the engine
 *  rejects falls back to the default rules. */
export function upperCase(text: string, locale: string | undefined): string {
    try {
        return text.toLocaleUpperCase(locale);
    } catch {
        return text.toUpperCase();
    }
}

/** Number text written with ASCII digits, `.` and `-` (a ratio, a `toFixed` price), in the
 *  digits and separators of `i18n`'s locale; unchanged in English. */
export function localizeNumberText(text: string, i18n: Translator | null | undefined): string {
    return localizeAscii(text, formatSettingsOf(i18n));
}
