import { Badge } from '@buzzkit/ui/components/badge';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Link, Menus } from '../Header';
import { spring } from './SlidingHighlight';

export function MobileMenu({ menus, cta, links }: { menus: Menus; cta: Link; links: Link[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className='md:hidden'>
      <button
        type='button'
        aria-label='Menu'
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className='relative flex size-8 cursor-pointer items-center justify-center rounded-xl transition-colors duration-150 hover:bg-bg-a2/70 active:bg-bg-a2/70'
      >
        <motion.span
          className='absolute h-[1.5px] w-4 rounded-full bg-fg-4'
          animate={{ rotate: open ? 45 : 0, y: open ? 0 : -4 }}
          transition={spring}
        />
        <motion.span
          className='absolute h-[1.5px] w-4 rounded-full bg-fg-4'
          animate={{ rotate: open ? -45 : 0, y: open ? 0 : 4 }}
          transition={spring}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <>
            <motion.div
              className='fixed inset-0 z-40'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={spring}
              className='absolute top-full right-4 z-50 mt-2 flex w-72 flex-col rounded-xl bg-bg-1 p-2 shadow-3 corner-superellipse/1.125'
            >
              <span className='px-2.5 pt-1.5 pb-1 font-medium text-fg-2 text-xs'>Features</span>
              {menus.features
                .flatMap((group) => group.items)
                .map((item) =>
                  item.soon ? (
                    <span
                      key={item.label}
                      className='flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-fg-2 text-sm'
                    >
                      {item.label}
                      <Badge size='sm'>Soon</Badge>
                    </span>
                  ) : (
                    <a
                      key={item.href}
                      href={item.href}
                      className='rounded-lg px-2.5 py-1.5 font-medium text-fg-4 text-sm'
                    >
                      {item.label}
                    </a>
                  )
                )}
              <span className='mx-2 my-1.5 border-bg-3 border-t' />
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className='rounded-lg px-2.5 py-1.5 font-medium text-fg-4 text-sm'
                >
                  {link.label}
                </a>
              ))}
              <a href={cta.href} className='rounded-lg px-2.5 py-1.5 font-medium text-fg-4 text-sm'>
                {cta.label}
              </a>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
