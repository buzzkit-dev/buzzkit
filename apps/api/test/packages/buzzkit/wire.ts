type EncodedId<V> = V extends number ? string : V;

type Encoded<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Encoded<U>>
    : T extends object
      ? {
          [K in keyof T]: K extends 'id' | `${string}Id` ? EncodedId<T[K]> : Encoded<T[K]>;
        }
      : T;

type Align<Api, Sdk> = unknown extends Api
  ? Sdk
  : Api extends Date
    ? Api
    : Api extends Array<infer ApiItem>
      ? Sdk extends Array<infer SdkItem>
        ? Array<Align<ApiItem, SdkItem>>
        : Api
      : Api extends object
        ? Sdk extends object
          ? { [K in keyof Api]: K extends keyof Sdk ? Align<Api[K], Sdk[K]> : Api[K] }
          : Api
        : Api;

export type Expect<T extends true> = T;

export type Matches<Sdk, ApiRaw, Api = Align<Encoded<ApiRaw>, Sdk>> = [Sdk] extends [Api]
  ? [Api] extends [Sdk]
    ? true
    : { theApiAlsoReturns: Api }
  : { theSdkDoesNotMatch: Api };

export type Accepts<Sdk, ApiRaw, Api = Encoded<ApiRaw>> = [Api] extends [Sdk]
  ? true
  : { theSdkDoesNotAccept: Api };
