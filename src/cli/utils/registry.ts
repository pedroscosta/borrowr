import { z } from 'zod';
import { getConfig } from './config';

export const getRegistryBasePathFromConfig = async (cwd: string) => {
  const config = await getConfig(cwd);

  // Only raw-github is supported right now
  return `${config.repository.url.replace('github.com', 'raw.githubusercontent.com')}/main`;
};

const fetchRegistry = async (baseUrl: string, paths: string[]) => {
  try {
    const results = await Promise.all(
      paths.map(async (path) => {
        const response = await fetch(`${baseUrl}/${path}`);
        return await response.text();
      }),
    );

    return results;
  } catch (error) {
    throw new Error(`Failed to fetch registry from ${baseUrl}.`);
  }
};

export const elementRegisterSchema = z.object({
  files: z.array(z.string()).nonempty(),
  dependencies: z.array(z.string()).optional(),
  registryDependencies: z.array(z.string()).optional(),
});

export const registryIndexSchema = z.object({
  version: z
    .string()
    .regex(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    ),
  registry: z.record(z.string(), elementRegisterSchema),
});

export const getRegistryIndex = async (baseUrl: string) => {
  try {
    const [result] = await fetchRegistry(baseUrl, ['.borrowmeta']);

    return registryIndexSchema.parse(JSON.parse(result));
  } catch (error) {
    throw new Error(`Failed to fetch commands from registry.`);
  }
};

export const resolveTree = async (index: z.infer<typeof registryIndexSchema>, ids: string[]) => {
  let tree: z.infer<typeof registryIndexSchema>['registry'] = {};

  for (const id of ids) {
    const entry = index.registry[id];

    if (!entry) continue;

    tree[id] = entry;

    if (entry.registryDependencies) {
      const deps = await resolveTree(index, entry.registryDependencies);
      tree = { ...tree, ...deps };
    }
  }

  return tree;
};

export const fetchTree = async (
  baseUrl: string,
  tree: z.infer<typeof registryIndexSchema>['registry'],
) => {
  const fetchedTree: Record<
    string,
    z.infer<typeof elementRegisterSchema> & { rawFiles: string[] }
  > = {};

  for (const [id, register] of Object.entries(tree)) {
    fetchedTree[id] = { ...register, rawFiles: await fetchRegistry(baseUrl, register.files) };
  }

  return fetchedTree;
};
