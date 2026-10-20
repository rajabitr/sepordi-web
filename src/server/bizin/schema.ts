import "server-only";

import type { components, operations } from "./types";

/** Every schema of the Partner API, e.g. `Schemas["Order"]`. */
export type Schemas = components["schemas"];

export type OperationId = keyof operations;

type Responses<O extends OperationId> = operations[O]["responses"];
type SuccessCode<O extends OperationId> = Extract<keyof Responses<O>, 200 | 201 | 202>;
type JsonOf<R> = R extends { content: { "application/json": infer T } } ? T : never;

/** The JSON body of an operation's 2xx answer (a union when it has several, e.g. reply 201 | 202). */
export type Ok<O extends OperationId> = JsonOf<Responses<O>[SuccessCode<O>]>;

/** The JSON request body of an operation. */
export type Body<O extends OperationId> = operations[O] extends {
  requestBody?: { content: { "application/json": infer B } };
}
  ? B
  : never;

/** The query parameters of an operation. */
export type Query<O extends OperationId> = operations[O]["parameters"] extends { query?: infer Q }
  ? NonNullable<Q>
  : never;
