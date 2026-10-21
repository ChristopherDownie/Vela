import type { MessageDescriptor } from './types';

/**
 * Declare a translatable message: a stable, dotted id and its English text in ICU message
 * syntax (`'{count, plural, one {# bar} other {# bars}}'`). The descriptor is inert data;
 * a translator's `t()` resolves it. The build extracts every `msg()` call with literal
 * arguments into the English catalog, so keep both arguments string literals.
 */
export function msg(id: string, defaultMessage: string): MessageDescriptor {
    return Object.freeze({ id, defaultMessage });
}
