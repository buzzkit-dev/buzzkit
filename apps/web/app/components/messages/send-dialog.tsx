import { Button } from '@buzzkit/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@buzzkit/ui/components/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buzzkit/ui/components/select';
import { Textarea } from '@buzzkit/ui/components/textarea';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useActionFetcher } from '@/app/hooks/use-action-fetcher';
import type { Segment, Topic } from '@/app/lib/api.server';
import { CHANNEL_OPTIONS, type Channel, channelLabel } from '@/app/lib/channels';

type SendTarget = 'subscriber' | 'topic' | 'segment';

const EXAMPLES: { title: string; body: string }[] = [
  { title: 'Leg day', body: "Let's go." },
  { title: 'Your order shipped', body: 'Arrives Thursday between 9am and 1pm.' },
  { title: 'Table for two is ready', body: 'Head to the host stand whenever you are.' },
  { title: 'Price drop on your watchlist', body: 'Two items are now cheaper.' },
  { title: 'New sign-in from Chrome on Mac', body: 'If this was not you, reset your password now.' },
  { title: 'Ride arriving in 2 minutes', body: 'Meet your driver at the pickup point.' },
  { title: 'Streak at risk', body: 'A 20 minute run keeps it alive.' },
  { title: 'Jane replied to your thread', body: 'Tap to read her reply.' },
  { title: 'Back in stock', body: 'The item you wanted is available again.' },
  { title: 'Weekly digest', body: 'Five things you missed this week.' },
];

const TARGETS: { value: SendTarget; label: string }[] = [
  { value: 'subscriber', label: 'Subscribers' },
  { value: 'topic', label: 'Topic' },
  { value: 'segment', label: 'Segment' },
];

export function SendDialog({
  topics,
  segments,
  channels,
  messagesBase,
  initial,
  open,
  onOpenChange,
}: {
  topics: Topic[];
  segments: Segment[];
  channels: Channel[];
  messagesBase: string;
  initial?: { target: SendTarget; segment?: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { submit, pending } = useActionFetcher((data) => {
    onOpenChange(false);
    if (typeof data.id === 'string') navigate(`${messagesBase}/${data.id}`);
  });
  const [channel, setChannel] = useState<Channel>(channels[0] ?? 'push');
  const [target, setTarget] = useState<SendTarget>(initial?.target ?? 'subscriber');
  const [to, setTo] = useState('');
  const [topic, setTopic] = useState('');
  const [segment, setSegment] = useState(initial?.segment ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [example, setExample] = useState(EXAMPLES[0]!);
  const channelTopics = topics.filter((entry) => entry.channels.includes(channel));
  const channelName = channelLabel(channel).toLowerCase();

  const hasTarget =
    target === 'topic' ? topic.length > 0 : target === 'segment' ? segment.length > 0 : to.trim().length > 0;
  const canSend = hasTarget && (title.trim().length > 0 || body.trim().length > 0) && !pending;
  const targets = TARGETS.filter(
    (entry) =>
      (entry.value !== 'topic' || channelTopics.length > 0) &&
      (entry.value !== 'segment' || segments.length > 0)
  );

  useEffect(() => {
    if (!open) return;
    setChannel(channels[0] ?? 'push');
    setTarget(initial?.target ?? 'subscriber');
    setTo('');
    setTopic('');
    setSegment(initial?.segment ?? '');
    setTitle('');
    setBody('');
    setExample(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]!);
  }, [open, channels[0], initial?.target, initial?.segment]);

  useEffect(() => {
    if (!channelTopics.some((entry) => entry.slug === topic)) setTopic(channelTopics[0]?.slug ?? '');
  }, [channelTopics, topic]);

  useEffect(() => {
    if (!segments.some((entry) => entry.slug === segment)) setSegment(segments[0]?.slug ?? '');
  }, [segments, segment]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{initial?.target === 'segment' ? 'Send to segment' : 'Send test message'}</DialogTitle>
        </DialogHeader>
        <FieldGroup className='w-full'>
          <Field>
            <FieldLabel htmlFor='message-channel'>Channel</FieldLabel>
            <Select
              items={CHANNEL_OPTIONS.filter((option) => channels.includes(option.value))}
              value={channel}
              onValueChange={(value) => setChannel(value as Channel)}
            >
              <SelectTrigger id='message-channel' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.filter((option) => channels.includes(option.value)).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='message-target'>To</FieldLabel>
            <Select items={targets} value={target} onValueChange={(value) => setTarget(value as SendTarget)}>
              <SelectTrigger id='message-target' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {target === 'topic' ? (
            <Field>
              <FieldLabel htmlFor='message-topic'>Topic</FieldLabel>
              <Select
                items={channelTopics.map((entry) => ({ value: entry.slug, label: entry.name }))}
                value={topic}
                onValueChange={(value) => setTopic(String(value))}
              >
                <SelectTrigger id='message-topic' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channelTopics.map((entry) => (
                    <SelectItem key={entry.id} value={entry.slug}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Every subscriber opted in to this topic on {channelName} receives it.
              </FieldDescription>
            </Field>
          ) : target === 'segment' ? (
            <Field>
              <FieldLabel htmlFor='message-segment'>Segment</FieldLabel>
              <Select
                items={segments.map((entry) => ({ value: entry.slug, label: entry.name }))}
                value={segment}
                onValueChange={(value) => setSegment(String(value))}
              >
                <SelectTrigger id='message-segment' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((entry) => (
                    <SelectItem key={entry.id} value={entry.slug}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Every subscriber in this segment reachable on {channelName} gets it.
              </FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor='message-to'>External ids</FieldLabel>
              <Input
                id='message-to'
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder='user_42, user_43'
                autoComplete='off'
                spellCheck={false}
              />
              <FieldDescription>
                The ids your app identified these users with, separated by commas.
              </FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor='message-title'>Title</FieldLabel>
            <Input
              id='message-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={example.title}
              maxLength={500}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='message-body'>Body</FieldLabel>
            <Textarea
              id='message-body'
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={example.body}
              maxLength={4000}
              rows={3}
            />
          </Field>
          <Button
            className='w-full'
            disabled={!canSend}
            loading={pending}
            onClick={() => submit('send', { channel, target, to, topic, segment, title, body })}
          >
            {target === 'segment' ? 'Send to segment' : 'Send test message'}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
