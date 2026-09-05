# Imports

`POST /v1/imports` writes subscribers and their subscriptions in bulk, up to 1,000 normalized rows per request. It is the migration path from another push provider: the customer exports subscriptions from the provider's own dashboard or API, the file is mapped to rows, and each row goes through the same upsert and registration path as `PUT /v1/subscribers/:externalId` and `POST /v1/subscriptions`. buzzkit never calls the other provider; the export is self-served on their side.

Tokens survive the move because they belong to the app, not the provider: an APNs device token is bound to the bundle id and the device, an FCM registration token to the Firebase project. With the same APNs key and the same Firebase project connected as credentials, every imported token keeps delivering.

## The request — scope `subscribers:write`

```json
{
  "rows": [
    {
      "externalId": "user_42",
      "platform": "ios",
      "token": "…",
      "environment": "production",
      "attributes": { "plan": "pro" },
      "timezone": "Europe/Berlin",
      "language": "de",
      "country": "DE",
      "device": { "appVersion": "3.2.0", "osVersion": "17.4", "model": "iPhone15,2" },
      "lastSeenAt": "2026-08-01T10:00:00.000Z",
      "enabled": true
    },
    { "externalId": "user_42", "channel": "email", "address": "maya@acme.com" },
    { "externalId": "user_43", "attributes": { "plan": "free" } }
  ]
}
```

A row is a subscriber (`externalId`, required) with an optional subscription in the shape `POST /v1/subscriptions` takes (`channel`, `platform`, `environment`, `token` or `address`) and an optional profile:

- `attributes` **merge** into the existing attributes (a migration adds to what the app already set; it never wipes it). `$` keys are refused with 400 `system_attribute`, exactly as on `PUT`.
- `timezone`, `language`, `country` and `device` set the system attributes `$timezone`, `$language`, `$country`, `$appVersion`, `$osVersion` and `$deviceModel`. This is the one server-side path that writes device-derived system attributes, because the exporting provider observed the device; a later client identify refreshes them as usual.
- `lastSeenAt` carries the provider's last activity onto the subscription. It never moves an existing subscription's `lastSeenAt` backwards, so a live device is not made to look stale.
- `enabled: false` imports a subscription muted (the provider's unsubscribed state). It applies when the subscription is created; an existing subscription keeps its own setting, as with every registration.

A row without `channel`, `token` and `address` is a profile-only row: it upserts the subscriber and writes nothing on the subscription table.

## The response

Always 200 with the outcome of every row; a bad row never fails the batch:

```json
{
  "counts": {
    "rows": 3,
    "subscribersCreated": 2,
    "subscriptionsCreated": 2,
    "subscriptionsUpdated": 0,
    "unchanged": 1,
    "failed": 0
  },
  "failures": []
}
```

- `subscriptionsCreated` counts new subscriptions, `subscriptionsUpdated` re-registrations that changed something (a move, a reactivation, a platform or environment change) and `unchanged` rows that wrote nothing on the subscription table, including profile-only rows.
- `failures` lists rows the API refused, by index: `{ index, code, message, param }` with the same codes the single-row routes answer (`bad_request` for a push row without `platform`, `invalid_timezone`, `system_attribute`, `attributes_too_large`, `endpoint_owned`).

Two things fail the whole request instead: a body that does not validate (400 `validation`; more than 1,000 rows, a malformed date) and a channel that is not connected to the tenant (400 `channel_not_connected`, checked once for every channel the batch touches, before any row is written).

Rows are grouped by `externalId` and a subscriber's rows are written in order; groups run concurrently. Each row records its lifecycle on the [event stream](events.md) exactly like a single registration would (`$subscriber.created` / `$subscriber.updated`, `$subscription.registered`, `$subscription.removed` for a previous owner of a moved token).

## Mapping an export

The normalization from a provider's file to rows is the `@buzzkit/schema/imports` grammar, shared by the dashboard and anything else that parses an export:

- `parseCsv(text)` reads a CSV (quoted fields, escaped quotes, CRLF, a BOM) into lowercase headers and one record per row.
- `IMPORT_TARGETS` is the channel catalog the whole import reads from: one entry per kind of subscription (`ios` and `android` on the push channel, `email`, and `sms` and `web` marked unavailable until those connectors exist), each with its channel, platform, the label the column picker shows and the noun the summary counts under. Adding a channel is one entry plus an endpoint check in `map.ts`; nothing in the dashboard names a channel. A row whose target is not available is skipped as `unsupported_target` with "cannot be imported yet". A supported target whose channel has no credential on the destination tenant is skipped as `channel_not_connected` before submission, so one unavailable channel never fails a mixed import. Email is the exception: an email row on a tenant without an email credential (or an unsubscribed one under `unsubscribed: 'skip'`) becomes a profile row carrying the address as `attributes.email`, counted in `counts.profileEmails`, and an email row on a connected tenant carries the same attribute next to its subscription. `POST /v1/imports` applies the same rule server-side (`prepareEmailRow`), so a credential removed between preview and submission still cannot fail the batch. `planImport` counts per target and per channel (`byTarget`, `byChannel`).
- `detectPreset(headers)` recognizes a provider from its signature columns; `IMPORT_PRESETS` holds one `ImportMapping` per provider. OneSignal is recognized by `identifier` + `device_type`; its preset maps `device_type` 0 / 1 / 11 to Apple, Android and email, 5 / 7 / 8 to web and 14 to SMS, skips or mutes rows whose `invalid_identifier` is set, reads `external_user_id`, the `tags` JSON as attributes, `timezone_id`, `language`, `country`, `last_active`, `game_version`, `device_os` and `device_model`. The Apple environment applies to iOS rows only.
- `planImport(records, mapping, options)` turns records into rows plus the skipped ones with a reason (`no_external_id`, `no_endpoint`, `invalid_endpoint`, `unsupported_target`, `channel_not_connected`, `unsubscribed`) and the counts the dashboard shows. `options.connectedChannels` comes from the destination tenant's credentials and removes unconnected subscription rows from the plan, except email rows, which stay as profile rows with the address as an attribute. `options.anonymous` decides what happens to rows without an external id: `skip`, or `provider_id`, which imports them as `<idPrefix>:<provider id>` (`onesignal:…`). Because registering a token under a new `externalId` moves it, such a subscriber becomes the real user the first time the app identifies them through the SDK. `options.unsubscribed` is `skip` or `muted`; `options.environment` applies to every push row, since exports do not record it.
- A custom mapping names the columns for `externalId`, the token or address, a fixed target (`ios`, `android`, `email`) or a column with a value map, the optional profile columns, and the columns to keep as attributes.

The dashboard's **Import subscribers** dialog on the Subscribers page runs exactly this: parse in the browser, detect the preset or ask for the columns, show the plan, then describes its batches of 100 rows to the app's generic `BackgroundJobProvider`. The dialog closes immediately, and one persistent toast reports each confirmed batch across route navigation until the import completes or stops.
