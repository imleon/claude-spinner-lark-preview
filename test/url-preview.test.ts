import { beforeEach, describe, expect, it } from 'vitest';
import { Logger } from '../src/logger.js';
import { SPINNER_VERBS } from '../src/spinner-verbs.js';
import {
  buildInlinePreviewResponse,
  getCachedSpinnerVerb,
  handleUrlPreviewEvent,
  parseUrlPreviewRequest,
  resetCachedSpinnerVerb,
  type UrlPreviewRequestEnvelope,
} from '../src/url-preview.js';

const samplePayload: UrlPreviewRequestEnvelope = {
  app_id: 'cli_test_app',
  header: {
    event_id: 'evt_123',
    tenant_key: 'tenant_123',
    app_id: 'cli_test_app',
    event_type: 'url.preview.get',
  },
  event: {
    host: 'im_message',
    delivery_type: 'url_preview',
    operator: {
      tenant_key: 'tenant_123',
      open_id: 'ou_123',
    },
    context: {
      url: 'https://example.com/doc/123',
      preview_token: 'preview_123',
      open_message_id: 'om_123',
      open_chat_id: 'oc_123',
    },
  },
};

const flattenedPayload: UrlPreviewRequestEnvelope = {
  app_id: 'cli_test_app',
  event_id: 'evt_flat',
  tenant_key: 'tenant_flat',
  host: 'im_top_notice',
  url: 'https://example.com/flat',
  preview_token: 'preview_flat',
  open_message_id: 'om_flat',
  open_chat_id: 'oc_flat',
};

describe('url preview', () => {
  beforeEach(() => {
    resetCachedSpinnerVerb();
  });

  it('parses nested payloads', () => {
    expect(parseUrlPreviewRequest(samplePayload)).toEqual({
      url: 'https://example.com/doc/123',
      previewToken: 'preview_123',
      openMessageId: 'om_123',
      openChatId: 'oc_123',
      eventId: 'evt_123',
      appId: 'cli_test_app',
      tenantKey: 'tenant_123',
      host: 'im_message',
    });
  });

  it('parses flattened payloads', () => {
    expect(parseUrlPreviewRequest(flattenedPayload)).toEqual({
      url: 'https://example.com/flat',
      previewToken: 'preview_flat',
      openMessageId: 'om_flat',
      openChatId: 'oc_flat',
      eventId: 'evt_flat',
      appId: 'cli_test_app',
      tenantKey: 'tenant_flat',
      host: 'im_top_notice',
    });
  });

  it('builds inline spinner text with ellipsis', () => {
    const response = buildInlinePreviewResponse(samplePayload, { imageKey: 'img_v3_test' });
    const text = response.inline.i18n_title.zh_cn;

    expect(text.endsWith('...')).toBe(true);
    expect(SPINNER_VERBS).toContain(text.slice(0, -3));
    expect(response.inline.i18n_title.en_us).toBe(text);
    expect(response.inline.image_key).toBe('img_v3_test');
  });

  it('reuses the same cached verb within one minute', () => {
    const first = getCachedSpinnerVerb(1_000, 0.01);
    const second = getCachedSpinnerVerb(30_000, 0.99);

    expect(second).toBe(first);
  });

  it('refreshes the cached verb after one minute', () => {
    const first = getCachedSpinnerVerb(120_000, 0.01);
    const second = getCachedSpinnerVerb(180_001, 0.99);

    expect(first).not.toBe(second);
    expect(SPINNER_VERBS).toContain(first);
    expect(SPINNER_VERBS).toContain(second);
  });

  it('handles event end-to-end', async () => {
    const response = await handleUrlPreviewEvent(samplePayload, {
      logger: new Logger('error'),
      expectedAppId: 'cli_test_app',
    });
    const text = response.inline.i18n_title.zh_cn;

    expect(text.endsWith('...')).toBe(true);
    expect(SPINNER_VERBS).toContain(text.slice(0, -3));
    expect(response.inline.i18n_title.en_us).toBe(text);
  });

});
