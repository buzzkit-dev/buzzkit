export type ImportFailure = { index: number; code: string; message: string; param: string | null };

export type ImportSubscriptionOutcome = 'created' | 'updated' | 'unchanged';

export type ImportRowOutcome = {
  subscriberCreated: boolean;
  subscription: ImportSubscriptionOutcome | 'none';
  emailSubscription?: ImportSubscriptionOutcome;
};

export type ImportResult = {
  counts: {
    rows: number;
    subscribersCreated: number;
    subscriptionsCreated: number;
    subscriptionsUpdated: number;
    unchanged: number;
    failed: number;
  };
  failures: ImportFailure[];
};
