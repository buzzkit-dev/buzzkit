'use client';

import * as React from 'react';

export type Register<T> = (entry: T) => () => void;

export function createRegistryContext<T>(name: string) {
  const Context = React.createContext<Register<T> | null>(null);
  Context.displayName = name;

  function RegistryProvider({ register, children }: { register: Register<T>; children: React.ReactNode }) {
    return <Context.Provider value={register}>{children}</Context.Provider>;
  }

  function useRegister(): Register<T> | null {
    return React.useContext(Context);
  }

  return { RegistryProvider, useRegister };
}
