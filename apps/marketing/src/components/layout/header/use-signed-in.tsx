import { useEffect, useState } from 'react';

export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(document.documentElement.hasAttribute('data-signed-in'));
  }, []);
  return signedIn;
}
