// Vela's message system: `msg()` descriptors, locale packs, and the per-chart translator.
export { msg, withValues } from './message';
export { sourceText, textOf } from './text';
export { registerLocale, registeredLocales } from './registry';
export { createTranslator, englishTranslator, formatSettingsOf, isMessageDescriptor, LocaleState } from './translator';
export { canonicalLocale, fallbackChain, localeDirection } from './locale';
export type {
    MessageDescriptor,
    MessageLike,
    MessageValues,
    LocalePack,
    VelaMessageCatalog,
    VelaMessageId,
    TextDirection,
    LocalizationOptions,
    Translator,
    LocaleChangedEvent,
} from './types';
