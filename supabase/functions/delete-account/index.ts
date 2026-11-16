import { handleDelete } from './handler.ts';

Deno.serve((request: Request) =>
  handleDelete(request, {
    env: (name: string) => Deno.env.get(name),
    fetch,
  }),
);
