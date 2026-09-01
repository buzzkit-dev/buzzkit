export const DELIVERY_RETENTION_DAYS = 30;

export const MAX_PAYLOAD_BYTES = 256 * 1024;

export const SOURCE_AUDIT_IGNORE = [
  'updatedAt',
  'lastDeliveryAt',
  'secretCiphertext',
  'secretIv',
  'dekCiphertext',
  'dekIv',
  'keyVersion',
] as const;
