import { FALLBACK_SPINNER_VERB, SPINNER_VERBS } from './spinner-verbs.js';
import type { Logger } from './logger.js';

export type PreviewHost = 'im_message' | 'im_top_notice' | string;

export interface UrlPreviewRequestEnvelope {
  schema?: string;
  app_id?: string;
  event_id?: string;
  tenant_key?: string;
  host?: PreviewHost;
  url?: string;
  preview_token?: string;
  open_message_id?: string;
  open_chat_id?: string;
  operator?: {
    tenant_key?: string;
    user_id?: string;
    open_id?: string;
  };
  context?: {
    url?: string;
    preview_token?: string;
    open_message_id?: string;
    open_chat_id?: string;
  };
  header?: {
    event_id?: string;
    token?: string;
    create_time?: string;
    event_type?: string;
    tenant_key?: string;
    app_id?: string;
  };
  event?: {
    operator?: {
      tenant_key?: string;
      user_id?: string;
      open_id?: string;
    };
    host?: PreviewHost;
    delivery_type?: string;
    context?: {
      url?: string;
      preview_token?: string;
      open_message_id?: string;
      open_chat_id?: string;
    };
  };
}

export interface UrlPreviewResponse {
  inline: {
    i18n_title: {
      zh_cn: string;
      en_us: string;
    };
    image_key?: string;
  };
}

export interface ParsedUrlPreviewRequest {
  url: string | null;
  previewToken: string | null;
  openMessageId: string | null;
  openChatId: string | null;
  eventId: string | null;
  appId: string | null;
  tenantKey: string | null;
  host: string | null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const PREVIEW_TEXT_CACHE_MS = 60_000;

let cachedSpinnerSelection:
  | {
      verb: string;
      expiresAt: number;
    }
  | null = null;

function randomSpinnerVerb(randomValue: number = Math.random()): string {
  const index = Math.floor(randomValue * SPINNER_VERBS.length);
  return SPINNER_VERBS[index] ?? FALLBACK_SPINNER_VERB;
}

export function resetCachedSpinnerVerb(): void {
  cachedSpinnerSelection = null;
}

export function getCachedSpinnerVerb(now: number = Date.now(), randomValue: number = Math.random()): string {
  if (cachedSpinnerSelection && now < cachedSpinnerSelection.expiresAt) {
    return cachedSpinnerSelection.verb;
  }

  try {
    const verb = randomSpinnerVerb(randomValue);
    cachedSpinnerSelection = {
      verb,
      expiresAt: now + PREVIEW_TEXT_CACHE_MS,
    };
    return verb;
  } catch {
    const verb = randomSpinnerVerb();
    cachedSpinnerSelection = {
      verb,
      expiresAt: now + PREVIEW_TEXT_CACHE_MS,
    };
    return verb;
  }
}

export function parseUrlPreviewRequest(payload: UrlPreviewRequestEnvelope): ParsedUrlPreviewRequest {
  const topLevelContext = payload.context;
  const nestedContext = payload.event?.context;

  return {
    url: getString(nestedContext?.url) ?? getString(topLevelContext?.url) ?? getString(payload.url),
    previewToken:
      getString(nestedContext?.preview_token) ??
      getString(topLevelContext?.preview_token) ??
      getString(payload.preview_token),
    openMessageId:
      getString(nestedContext?.open_message_id) ??
      getString(topLevelContext?.open_message_id) ??
      getString(payload.open_message_id),
    openChatId:
      getString(nestedContext?.open_chat_id) ??
      getString(topLevelContext?.open_chat_id) ??
      getString(payload.open_chat_id),
    eventId: getString(payload.header?.event_id) ?? getString(payload.event_id),
    appId: getString(payload.app_id) ?? getString(payload.header?.app_id),
    tenantKey:
      getString(payload.header?.tenant_key) ??
      getString(payload.event?.operator?.tenant_key) ??
      getString(payload.operator?.tenant_key) ??
      getString(payload.tenant_key),
    host: getString(payload.event?.host) ?? getString(payload.host),
  };
}

export function buildInlinePreviewResponse(
  _payload: UrlPreviewRequestEnvelope,
  options?: { imageKey?: string },
): UrlPreviewResponse {
  const previewText = `${getCachedSpinnerVerb()}...`;

  return {
    inline: {
      i18n_title: {
        zh_cn: previewText,
        en_us: previewText,
      },
      ...(options?.imageKey ? { image_key: options.imageKey } : {}),
    },
  };
}

export async function handleUrlPreviewEvent(
  payload: UrlPreviewRequestEnvelope,
  deps: { logger: Logger; expectedAppId?: string; imageKey?: string },
): Promise<UrlPreviewResponse> {
  const parsed = parseUrlPreviewRequest(payload);

  if (deps.expectedAppId && parsed.appId && parsed.appId !== deps.expectedAppId) {
    deps.logger.warn('Received url.preview.get for unexpected app_id', {
      expectedAppId: deps.expectedAppId,
      receivedAppId: parsed.appId,
      eventId: parsed.eventId,
    });
  }

  if (!parsed.eventId && !parsed.host && !parsed.url && !parsed.previewToken && !parsed.openMessageId) {
    deps.logger.warn('Unable to parse url.preview.get payload shape', {
      topLevelKeys: Object.keys(payload),
      hasHeader: !!payload.header,
      hasEvent: !!payload.event,
      hasContext: !!payload.context,
      rawPayload: payload,
    });
  }

  deps.logger.info('Handling url.preview.get event', {
    eventId: parsed.eventId,
    host: parsed.host,
    url: parsed.url,
    previewToken: parsed.previewToken,
    openMessageId: parsed.openMessageId,
  });

  return buildInlinePreviewResponse(payload, { imageKey: deps.imageKey });
}
