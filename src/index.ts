import * as Lark from '@larksuiteoapi/node-sdk';
import { Logger, type LogLevel } from './logger.js';
import { handleUrlPreviewEvent, type UrlPreviewRequestEnvelope, type UrlPreviewResponse } from './url-preview.js';

interface AppConfig {
  appId: string;
  appSecret: string;
  encryptKey: string;
  verificationToken: string;
  domain: Lark.Domain | string;
  logLevel: LogLevel;
  inlineImageKey?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveDomain(input: string | undefined): Lark.Domain | string {
  const normalized = (input ?? 'Feishu').trim().toLowerCase();

  if (normalized === 'feishu') {
    return Lark.Domain.Feishu;
  }

  if (normalized === 'lark') {
    return Lark.Domain.Lark;
  }

  return input ?? 'Feishu';
}

function loadConfig(): AppConfig {
  return {
    appId: required('LARK_APP_ID'),
    appSecret: required('LARK_APP_SECRET'),
    encryptKey: process.env.LARK_ENCRYPT_KEY?.trim() || '',
    verificationToken: process.env.LARK_VERIFICATION_TOKEN?.trim() || '',
    domain: resolveDomain(process.env.LARK_DOMAIN),
    logLevel: ((process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info'),
    inlineImageKey: process.env.LARK_INLINE_IMAGE_KEY?.trim() || undefined,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const abortController = new AbortController();
  const dispatcher = new Lark.EventDispatcher({
    encryptKey: config.encryptKey,
    verificationToken: config.verificationToken,
  });
  const wsClient = new Lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: config.domain,
    loggerLevel: Lark.LoggerLevel.info,
  });

  const handlers: Record<string, (data: unknown) => Promise<unknown>> = {
    'url.preview.get': async (data: unknown): Promise<UrlPreviewResponse> => {
      return handleUrlPreviewEvent(data as UrlPreviewRequestEnvelope, {
        logger,
        expectedAppId: config.appId,
        imageKey: config.inlineImageKey,
      });
    },
  };

  dispatcher.register(handlers as never);

  const wsClientAny = wsClient as unknown as {
    handleEventData: (data: unknown) => unknown;
    start: (input: { eventDispatcher: unknown }) => Promise<void> | void;
    close: (input?: { force?: boolean }) => void;
  };

  const originalHandleEventData = wsClientAny.handleEventData.bind(wsClientAny);
  wsClientAny.handleEventData = (data: unknown) => {
    logger.debug('Received raw websocket packet for Lark preview service');
    return originalHandleEventData(data);
  };

  const shutdown = (): void => {
    abortController.abort();
    logger.info('Stopping Lark WS client');
    wsClientAny.close({ force: true });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  logger.info('Claude spinner lark preview booting', {
    appId: config.appId,
  });
  logger.info('Starting Lark WS client for url.preview.get');

  await Promise.resolve(wsClientAny.start({ eventDispatcher: dispatcher }));
  await new Promise<void>((resolve) => {
    abortController.signal.addEventListener(
      'abort',
      () => {
        logger.info('Abort signal received, stopping Lark WS client');
        wsClientAny.close({ force: true });
        resolve();
      },
      { once: true },
    );
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
