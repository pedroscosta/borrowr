import { z } from 'zod';

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

export const registrySpecSchema = z.object({
  version: z
    .string()
    .regex(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    ),
  baseUrl: z.string(),
  basePath: z.string(),
  registry: z.record(z.string(), elementRegisterSchema),
});

export type RegistrySpec = z.infer<typeof registrySpecSchema>;

export const getRegistrySpec = async (specUrl: string) => {
  try {
    const response = await fetch(specUrl);
    const result = await response.text();

    return registrySpecSchema.parse(JSON.parse(result));
  } catch (error) {
    throw new Error(`Failed to fetch commands from registry.`);
  }
};

export const resolveTree = async (
  registrySpec: z.infer<typeof registrySpecSchema>,
  ids: string[],
) => {
  let tree: z.infer<typeof registrySpecSchema>['registry'] = {};

  for (const id of ids) {
    const entry = registrySpec.registry[id];

    if (!entry) continue;

    tree[id] = entry;

    if (entry.registryDependencies) {
      const deps = await resolveTree(registrySpec, entry.registryDependencies);
      tree = { ...tree, ...deps };
    }
  }

  return tree;
};

export const fetchTree = async (
  baseUrl: string,
  tree: z.infer<typeof registrySpecSchema>['registry'],
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
