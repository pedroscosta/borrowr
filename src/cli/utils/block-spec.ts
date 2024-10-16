export type BlockSpec = {
  remoteId: string;
  blockId?: string;
};

export const parseBlockSpec = (blockSpec: string): BlockSpec => {
  const [remoteId, blockId] = blockSpec.split(':');

  if (!remoteId) throw new Error('Missing remote id');

  return { remoteId, blockId };
};
