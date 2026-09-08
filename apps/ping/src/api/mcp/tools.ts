export const PROTOCOL_VERSION = '2025-06-18';

export const SERVER_INFO = { name: 'buzz', version: '1.0.0' };

export const TOOLS = [
  {
    name: 'buzz_notify',
    description:
      "Send a one-off notification to the user's phone. Use when work is finished and there was nothing to report along the way.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Read on a Lock Screen — short and concrete.' },
        body: { type: 'string', description: 'One line of detail.' },
        url: { type: 'string', description: 'Deep link opened when the user taps.' },
        important: {
          type: 'boolean',
          description:
            'Reaches the phone even while the user is marked present. Use for the setup confirmation, for any test the user asks for, and for news that must not wait.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'buzz_session',
    description:
      "Report progress on long-running work as a Live Activity on the user's Lock Screen. Call with the same session id to update in place. Set status to waiting when you are blocked and need a decision — it floats to the top as 'Waiting on you' so the user knows to come back. Buzz never answers for you. Always close the session with status done or failed.",
    inputSchema: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Stable id you choose and reuse, such as project/branch. One per unit of work.',
        },
        title: {
          type: 'string',
          description: 'What is happening right now, or the decision you are blocked on when waiting.',
        },
        body: { type: 'string', description: 'One line of detail.' },
        status: {
          type: 'string',
          enum: ['working', 'waiting', 'done', 'failed'],
          description:
            'Defaults to working. Use waiting when you are blocked on the user: it always buzzes the phone, even while they are marked present. Send done or failed when the work ends.',
        },
        progress: { type: 'number', minimum: 0, maximum: 1 },
        agent: { type: 'string', description: 'Which tool is reporting, such as claude-code.' },
        project: { type: 'string', description: 'Repository or directory name.' },
        important: {
          type: 'boolean',
          description:
            'Buzzes the phone for this update even while the user is marked present or a Live Activity is already carrying the session. Reserve for a failure or a decision that must not wait.',
        },
      },
      required: ['session', 'title'],
    },
  },
  {
    name: 'buzz_presence',
    description:
      'Tell Buzz whether the user is at their desk. Call with present true whenever the user interacts with you (a message, an approval, any action); the window restarts each time and lapses on its own. Call with present false when they say they are stepping away — then notify them when you finish or need them. While present, Buzz holds ordinary pings to the in-app timeline; waiting and important ones still buzz.',
    inputSchema: {
      type: 'object',
      properties: {
        present: {
          type: 'boolean',
          description: 'true marks the user present, false marks them away. Defaults to true.',
        },
        seconds: {
          type: 'integer',
          minimum: 1,
          maximum: 3600,
          description:
            'How long the presence window lasts. Defaults to 30. Use more when the user says they are staying at their desk.',
        },
      },
    },
  },
] as const;
