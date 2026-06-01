/** Lenient E.164-ish phone pattern (avoids a libphonenumber-js runtime dependency). */
export const PHONE_REGEX = /^\+?[0-9][0-9\s\-()]{6,19}$/;
export const PHONE_MESSAGE = 'Must be a valid phone number';

/** 6-digit hex color (FR-037 branding). */
export const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6})$/;

/** HH:mm 24h (availability slots, FR-030/039). */
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
