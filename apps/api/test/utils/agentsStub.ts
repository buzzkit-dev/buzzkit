export class Agent {}

export function getAgentByName(): never {
  throw new Error('agents is not available in unit tests');
}
