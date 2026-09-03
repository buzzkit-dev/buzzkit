import { cn } from '@buzzkit/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

const spring = { type: 'spring', visualDuration: 0.25, bounce: 0 } as const;

function Item({ question, answer, last }: { question: string; answer: string; last: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(!last && 'border-bg-3 border-b')}>
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between gap-4 pt-5 text-left outline-none transition-[padding] duration-150 focus-visible:text-fg-4',
          open ? 'pb-2.5' : 'pb-5'
        )}
      >
        <span className='font-medium text-base text-fg-4'>{question}</span>
        <motion.span
          className='relative flex size-5 shrink-0 items-center justify-center text-fg-3'
          animate={{ rotate: open ? 180 : 0 }}
          transition={spring}
        >
          <span className='absolute h-[1.5px] w-3 rounded-full bg-current' />
          <motion.span
            className='absolute h-3 w-[1.5px] rounded-full bg-current'
            animate={{ scaleY: open ? 0 : 1 }}
            transition={spring}
          />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className='overflow-hidden'
          >
            <p className='pb-5 text-fg-2 text-pretty leading-relaxed'>{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FaqList({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className='flex flex-col'>
      {items.map((item, index) => (
        <Item
          key={item.question}
          question={item.question}
          answer={item.answer}
          last={index === items.length - 1}
        />
      ))}
    </div>
  );
}
