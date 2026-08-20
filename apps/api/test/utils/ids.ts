import Sqids from 'sqids';

const sqids = new Sqids({
  minLength: 18,
  alphabet: 'kdiEK9YyRrDlM4pnPXWQmL2wNZzeUxIqSHVvTGtjb0aJFuh3s618Bf5cCgAO7o',
});

export const encodeMessageId = (id: number) => `msg_${sqids.encode([id])}`;

export const encodeDeliveryId = (id: number) => `dlv_${sqids.encode([id])}`;
