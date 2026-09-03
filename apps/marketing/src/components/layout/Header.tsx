import { Icon } from '@buzzkit/ui/components/icon';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@buzzkit/ui/components/navigation-menu';
import { TextSwap } from '@buzzkit/ui/components/text-swap';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { useState } from 'react';
import { Logo } from '../ui/Logo';
import { type MenuGroup, MenuPanel } from './header/MenuPanel';
import { MobileMenu } from './header/MobileMenu';
import { SlidingHighlight, useSlidingHighlight } from './header/SlidingHighlight';
import { useSignedIn } from './header/use-signed-in';

export interface Menus {
  features: MenuGroup[];
}

export interface Link {
  label: string;
  href: string;
}

function accountCta(dashboardUrl: string, signupUrl: string, signedIn: boolean): Link {
  return signedIn ? { label: 'Dashboard', href: dashboardUrl } : { label: 'Get Started', href: signupUrl };
}

function resolvePlainLinks(docsUrl: string): Link[] {
  return [
    { label: 'Pricing', href: '/pricing' },
    { label: 'Docs', href: docsUrl },
  ];
}

export function Header({
  dashboardUrl,
  signupUrl,
  docsUrl,
  githubUrl,
  menus,
}: {
  dashboardUrl: string;
  signupUrl: string;
  docsUrl: string;
  githubUrl: string;
  menus: Menus;
}) {
  const { scrollY } = useScroll();
  const signedIn = useSignedIn();
  const [scrolled, setScrolled] = useState(false);
  const slider = useSlidingHighlight<HTMLUListElement>();
  const cta = accountCta(dashboardUrl, signupUrl, signedIn);
  const plainLinks = resolvePlainLinks(docsUrl);

  const leaveList = () => {
    const openTrigger = slider.containerRef.current?.querySelector('[aria-expanded="true"]');
    if (openTrigger) return;
    slider.clear();
  };

  useMotionValueEvent(scrollY, 'change', (latest) => setScrolled(latest > 20));

  return (
    <header
      className='sticky top-0 z-50 bg-background px-6 transition-[padding-top] duration-250 ease-out'
      style={{ paddingTop: scrolled ? 0 : 16 }}
    >
      <div className='mx-auto max-w-5xl'>
        <div className='flex h-14 items-center justify-between'>
          <a href='/' className='flex items-center gap-2 text-fg-4' aria-label='BuzzKit home'>
            <Logo className='size-6' />
            <span className='font-semibold text-base tracking-tight'>BuzzKit</span>
          </a>
          <NavigationMenu className='max-md:hidden' align='center'>
            <NavigationMenuList ref={slider.containerRef} className='relative' onMouseLeave={leaveList}>
              <SlidingHighlight highlight={slider.highlight} pressed={slider.pressed} />
              <NavigationMenuItem>
                <NavigationMenuTrigger
                  className='relative z-10'
                  onMouseEnter={(event) => slider.move(event.currentTarget)}
                  onFocus={(event) => slider.move(event.currentTarget)}
                  onMouseDown={slider.press}
                  onMouseUp={slider.release}
                >
                  Features
                </NavigationMenuTrigger>
                <NavigationMenuContent onMouseLeave={slider.clear}>
                  <MenuPanel label='Features' groups={menus.features} columns={2} />
                </NavigationMenuContent>
              </NavigationMenuItem>
              {plainLinks.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink
                    href={link.href}
                    className={`${navigationMenuTriggerStyle()} relative z-10 hover:bg-transparent active:bg-transparent`}
                    onMouseEnter={(event) => slider.move(event.currentTarget)}
                    onFocus={(event) => slider.move(event.currentTarget)}
                    onMouseDown={slider.press}
                    onMouseUp={slider.release}
                  >
                    {link.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <div className='flex items-center gap-2'>
            <a
              href={githubUrl}
              target='_blank'
              rel='noreferrer'
              aria-label='BuzzKit on GitHub'
              className='flex size-8 items-center justify-center rounded-xl text-fg-2 transition-colors duration-150 hover:bg-bg-a2/70 hover:text-fg-4 active:bg-bg-a2/70 active:text-fg-4'
            >
              <Icon name='IconGithub' className='size-5.5' />
            </a>
            <a
              href={cta.href}
              className="relative isolate flex h-8 items-center rounded-xl px-3 font-medium text-primary-foreground text-sm before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-primary before:shadow-control before:transition-[background-color,inset] before:duration-150 before:ease-out before:content-[''] corner-superellipse/1.125 hover:before:bg-primary/80 active:before:inset-x-(--press-inset-x) active:before:inset-y-(--press-inset-y) active:before:bg-primary/80"
            >
              <TextSwap>{cta.label}</TextSwap>
            </a>
            <MobileMenu menus={menus} cta={cta} links={plainLinks} />
          </div>
        </div>
        <div
          className='-mx-6 h-px bg-bg-3 transition-opacity duration-200'
          style={{ opacity: scrolled ? 1 : 0 }}
        />
      </div>
    </header>
  );
}
