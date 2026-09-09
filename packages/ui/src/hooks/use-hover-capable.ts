import * as React from 'react';

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

export function useHoverCapable() {
  const [capable, setCapable] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia(HOVER_QUERY);
    const onChange = () => setCapable(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return capable;
}
