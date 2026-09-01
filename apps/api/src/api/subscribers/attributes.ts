import { BadRequestError } from '@buzzkit/api/libs/error';
import { assertJsonSize } from '@buzzkit/api/utils/json';
import { isTimezone } from '@buzzkit/schema/workflows';
import { MAX_ATTRIBUTES_BYTES, SYSTEM_ATTRIBUTE_PREFIX } from './constants';
import type { DeviceContext } from './schemas';

export function assertAttributesSize(attributes: Record<string, unknown> | undefined): void {
  assertJsonSize(attributes, MAX_ATTRIBUTES_BYTES, 'attributes must serialize to 64KB or less', {
    code: 'attributes_too_large',
    param: 'attributes',
  });
}

export function assertTimezone(timezone: string | undefined): void {
  if (timezone !== undefined && !isTimezone(timezone)) {
    throw new BadRequestError(`Unknown timezone '${timezone}'`, {
      code: 'invalid_timezone',
      param: 'timezone',
    });
  }
}

export function assertNoSystemAttributes(attributes: Record<string, unknown> | undefined): void {
  if (!attributes) return;
  for (const key of Object.keys(attributes)) {
    if (key.startsWith(SYSTEM_ATTRIBUTE_PREFIX)) {
      throw new BadRequestError(`'${key}' is a system attribute and cannot be set through the API`, {
        code: 'system_attribute',
        param: 'attributes',
      });
    }
  }
}

export function deviceSystemAttributes(device: DeviceContext | undefined): Record<string, string> {
  if (!device) return {};

  const attributes: Record<string, string> = {};
  if (device.appVersion) attributes.$appVersion = device.appVersion;
  if (device.appBuild) attributes.$appBuild = device.appBuild;
  if (device.sdkVersion) attributes.$sdkVersion = device.sdkVersion;
  if (device.osVersion) attributes.$osVersion = device.osVersion;
  if (device.model) attributes.$deviceModel = device.model;
  if (device.locale) attributes.$locale = device.locale;
  if (device.installedAt) attributes.$appInstalledAt = device.installedAt;

  return attributes;
}

export function resolveSystemAttributes(request: Request): Record<string, string> {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const attributes: Record<string, string> = {};
  const country = cf?.country ?? request.headers.get('cf-ipcountry');
  if (country && country !== 'XX' && country !== 'T1') attributes.$country = country;
  if (cf?.city) attributes.$city = cf.city;
  if (cf?.region) attributes.$region = cf.region;
  if (cf?.timezone) attributes.$timezone = cf.timezone;
  const language = request.headers.get('accept-language')?.split(',')[0]?.trim();
  if (language && language !== '*') attributes.$language = language;

  return attributes;
}
