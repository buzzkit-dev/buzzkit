'use client';

import * as React from 'react';

type LinkProps = Omit<React.ComponentProps<'a'>, 'href'> & { to: string };
type LinkComponent = React.ComponentType<LinkProps>;

const PlainLink: LinkComponent = ({ to, ...props }) => <a href={to} {...props} />;

const LinkContext = React.createContext<LinkComponent>(PlainLink);

function LinkProvider({ link, children }: { link: LinkComponent; children: React.ReactNode }) {
  return <LinkContext.Provider value={link}>{children}</LinkContext.Provider>;
}

function useLink(): LinkComponent {
  return React.useContext(LinkContext);
}

export { type LinkComponent, type LinkProps, LinkProvider, useLink };
