export type ImportFailure = { index: number; code: string; message: string; param: string | null };

export type ImportRowOutcome = {
  subscriberCreated: boolean;
  subscription: 'created' | 'updated' | 'unchanged' | 'none';
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
